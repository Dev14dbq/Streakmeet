#!/bin/bash
set -euo pipefail

cd /home/streakmeet

echo "==> Docker (Postgres, Redis, MinIO, NATS)..."
docker compose up -d
docker compose -f docker-compose.yml -f docker-compose.rework.yml up -d 2>/dev/null || true

echo "==> Wait for MinIO..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; then
    echo "MinIO ready"
    break
  fi
  sleep 2
done

echo "==> backend-rust/.env"
if [ ! -f backend-rust/.env ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  cp backend-rust/.env.example backend-rust/.env
  sed -i "s/change_me_in_production/${JWT_SECRET}/" backend-rust/.env
  echo "Создан backend-rust/.env — допиши GOOGLE_*, RESEND_API_KEY при необходимости"
fi

echo "==> Sync outbox migration (idempotent)..."
if [ -f backend-rust/migrations/001_sync_outbox.sql ]; then
  set -a
  # shellcheck disable=SC1091
  source backend-rust/.env
  set +a
  psql "$DATABASE_URL" -f backend-rust/migrations/001_sync_outbox.sql 2>/dev/null || true
fi

echo "==> Face service..."
cd face-service
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
cd ..

pm2 delete streakmeet-face 2>/dev/null || true
pm2 start /home/streakmeet/face-service/start.sh \
  --name streakmeet-face \
  --interpreter bash \
  --cwd /home/streakmeet/face-service

echo "==> Wait for face-service (модель грузится ~10–30 с)..."
FACE_OK=0
for i in $(seq 1 45); do
  if curl -sf http://127.0.0.1:8001/health >/dev/null 2>&1; then
    echo "Face service ready"
    FACE_OK=1
    break
  fi
  sleep 2
done
if [ "$FACE_OK" -eq 0 ]; then
  echo "WARN: face-service не ответил на :8001 — проверь: pm2 logs streakmeet-face"
fi

echo "==> Rust backend (debug build — release blocked by system GCC)..."
cd backend-rust
cargo build -p api-gateway -p sync-gateway -p worker-service
cd ..

echo "==> Frontend..."
cd frontend
{
  echo 'VITE_API_URL='
  echo 'VITE_USE_SYNC_STREAM=true'
  echo "VITE_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}"
} > .env.production
npm ci 2>/dev/null || npm install
npm run build
cd ..

echo "==> PM2 Rust services (stop legacy Node API)..."
pm2 delete streakmeet-api 2>/dev/null || true
pm2 delete streakmeet-api-node 2>/dev/null || true
pm2 start /home/streakmeet/deploy/ecosystem-rust.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "==> Nginx (Rust cutover)..."
cp /home/streakmeet/deploy/nginx-streakmeet-rust.conf /etc/nginx/sites-available/streakmeet
ln -sf /etc/nginx/sites-available/streakmeet /etc/nginx/sites-enabled/streakmeet
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t && systemctl reload nginx

echo "==> Firewall (SSH, HTTP, HTTPS)..."
ufw allow OpenSSH 2>/dev/null || ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable 2>/dev/null || true

echo "==> Health checks..."
curl -sf http://127.0.0.1:8080/health >/dev/null && echo "api-gateway OK"
curl -sf http://127.0.0.1:8081/health >/dev/null && echo "sync-gateway OK"

echo "==> Деплой завершён (Rust backend)."
