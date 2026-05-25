#!/bin/bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "==> Обновление системы..."
apt-get update -qq
apt-get upgrade -y -qq

echo "==> Базовые пакеты..."
apt-get install -y -qq \
  git curl wget ca-certificates gnupg lsb-release \
  build-essential ufw fail2ban \
  python3 python3-pip \
  postgresql-client redis-tools

echo "==> Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

echo "==> Node.js 20 (через NodeSource)..."
if ! node -v 2>/dev/null | grep -qE 'v(18|20|22)'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
echo "Node: $(node -v) npm: $(npm -v)"

echo "==> PM2 для бэкенда..."
npm install -g pm2

echo "==> PostgreSQL + Redis (Docker)..."
cd /home/streakmeet
docker compose up -d

echo "==> Ожидание PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec streakmeet_db pg_isready -U streakmeet -d streakmeet_db &>/dev/null; then
    echo "PostgreSQL готов"
    break
  fi
  sleep 2
done

echo "==> Готово. Версии:"
docker --version
node -v
nginx -v 2>&1 | head -1
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
