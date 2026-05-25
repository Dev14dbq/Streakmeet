#!/bin/bash
set -euo pipefail

cd /home/streakmeet

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
EOF
  echo "Создан backend/.env — допиши GOOGLE_* при необходимости"
fi

echo "==> Backend..."
cd backend
npm ci 2>/dev/null || npm install
npx prisma generate
npx prisma db push
npm run build
mkdir -p uploads
cd ..

echo "==> Frontend..."
cd frontend
# Продакшен: API на том же домене (nginx проксирует)
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

echo "==> Деплой завершён. Открой http://144.31.143.193"
