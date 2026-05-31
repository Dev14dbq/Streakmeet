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
echo "==> MinIO bucket (streakmeet-media)..."
docker compose exec -T minio sh -c '
  mc alias set local http://127.0.0.1:9000 streakmeet streakmeet_minio_secret 2>/dev/null
  mc mb local/streakmeet-media --ignore-existing 2>/dev/null
' || true

echo "==> backend-rust/.env"
if [ ! -f backend-rust/.env ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  cp backend-rust/.env.example backend-rust/.env
  sed -i "s/change_me_in_production/${JWT_SECRET}/" backend-rust/.env
  echo "Создан backend-rust/.env — допиши GOOGLE_*, RESEND_API_KEY при необходимости"
fi
# OAuth/JWT parity with legacy Node backend (required for Google login on Rust gateway)
if [ -f backend/.env ]; then
  sync_env_key() {
    local key="$1"
    local val
    val=$(grep -E "^${key}=" backend/.env | head -1 | cut -d= -f2- | tr -d '"' || true)
    [ -n "$val" ] || return 0
    if grep -q "^${key}=" backend-rust/.env; then
      sed -i "s|^${key}=.*|${key}=\"${val}\"|" backend-rust/.env
    else
      echo "${key}=\"${val}\"" >> backend-rust/.env
    fi
  }
  sync_env_key GOOGLE_CLIENT_ID
  sync_env_key APPLE_CLIENT_ID
  sync_env_key JWT_SECRET
  sync_env_key RESEND_API_KEY
  sync_env_key RESEND_FROM_EMAIL
  sync_env_key APP_PUBLIC_URL
  sync_env_key FACE_MODEL_TAG
  sync_env_key FACE_MATCH_THRESHOLD_SELF
  sync_env_key FACE_MATCH_THRESHOLD_PARTNER
  if ! grep -q '^UPLOADS_DIR=' backend-rust/.env 2>/dev/null; then
    echo 'UPLOADS_DIR="/home/streakmeet/uploads"' >> backend-rust/.env
  fi
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
GOOGLE_FOR_BUILD="${GOOGLE_CLIENT_ID:-}"
if [ -z "$GOOGLE_FOR_BUILD" ] && [ -f ../backend/.env ]; then
  GOOGLE_FOR_BUILD=$(grep -E '^GOOGLE_CLIENT_ID=' ../backend/.env | head -1 | cut -d= -f2- | tr -d '"' || true)
fi
if [ -z "$GOOGLE_FOR_BUILD" ] && [ -f .env ]; then
  GOOGLE_FOR_BUILD=$(grep -E '^VITE_GOOGLE_CLIENT_ID=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)
fi
{
  echo 'VITE_API_URL='
  echo 'VITE_RUST_GATEWAY_URL='
  echo 'VITE_USE_SYNC_STREAM=true'
  echo "VITE_GOOGLE_CLIENT_ID=${GOOGLE_FOR_BUILD}"
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
