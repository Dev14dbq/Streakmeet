#!/bin/bash
set -euo pipefail

cd /home/streakmeet

echo "==> Docker (Postgres, Redis, MinIO)..."
docker compose up -d

echo "==> Wait for MinIO..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; then
    echo "MinIO ready"
    break
  fi
  sleep 2
done

echo "==> backend/.env"
if [ ! -f backend/.env ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  cat > backend/.env << EOF
PORT=3000
DATABASE_URL="postgresql://streakmeet:streakmeet_password@127.0.0.1:5432/streakmeet_db"
REDIS_URL="redis://127.0.0.1:6379"
JWT_SECRET="${JWT_SECRET}"
JWT_EXPIRES_IN="7d"
JWT_REFRESH_EXPIRES_IN="30d"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
APPLE_CLIENT_ID=""
FACE_SERVICE_URL="http://127.0.0.1:8001"
S3_ENDPOINT="http://127.0.0.1:9000"
S3_REGION="us-east-1"
S3_BUCKET="streakmeet-media"
S3_ACCESS_KEY_ID="streakmeet"
S3_SECRET_ACCESS_KEY="streakmeet_minio_secret"
S3_FORCE_PATH_STYLE="true"
RESEND_API_KEY=""
RESEND_FROM_EMAIL="StreakMeet <onboarding@resend.dev>"
APP_PUBLIC_URL="https://spectrmod.com"
EOF
  echo "Создан backend/.env — допиши GOOGLE_*, RESEND_API_KEY при необходимости"
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
pm2 start face-service/start.sh --name streakmeet-face --interpreter bash
pm2 save

echo "==> Wait for face-service..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8001/health >/dev/null 2>&1; then
    echo "Face service ready"
    break
  fi
  sleep 2
done

echo "==> Backend..."
cd backend
npm ci 2>/dev/null || npm install
npx prisma generate
npx prisma db push --accept-data-loss
npm run build
npx tsx scripts/migrate-uploads-to-s3.ts 2>/dev/null || echo "Upload migration skipped or empty"
cd ..

echo "==> Frontend..."
cd frontend
echo 'VITE_API_URL=' > .env.production
echo "VITE_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}" >> .env.production
npm ci 2>/dev/null || npm install
npm run build
cd ..

echo "==> PM2 backend..."
cd backend
pm2 delete streakmeet-api 2>/dev/null || true
pm2 start dist/index.js --name streakmeet-api
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
cd ..

echo "==> Nginx..."
cp /home/streakmeet/deploy/nginx-streakmeet.conf /etc/nginx/sites-available/streakmeet
ln -sf /etc/nginx/sites-available/streakmeet /etc/nginx/sites-enabled/streakmeet
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t && systemctl reload nginx

echo "==> Firewall (SSH, HTTP, HTTPS)..."
ufw allow OpenSSH 2>/dev/null || ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable 2>/dev/null || true

echo "==> Деплой завершён."
