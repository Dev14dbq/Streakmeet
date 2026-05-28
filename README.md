# StreakMeet

Mobile-first app for daily in-person meet streaks with friends (face verification, map, remote selfies).

## Stack

- **Frontend:** React 19 + Vite + Capacitor (Android/iOS)
- **Backend:** Express 5 + Prisma + PostgreSQL
- **Media:** MinIO (S3-compatible)
- **Face:** Python InsightFace microservice (`face-service/`, port 8001)
- **Email:** Resend

## Local development

```bash
# 1. Start Postgres, Redis, MinIO
docker compose up -d

# 2. Backend
cp backend/.env.example backend/.env
# Edit backend/.env (JWT_SECRET, RESEND_API_KEY, etc.)
cd backend && npm install && npx prisma db push && npm run dev

# 3. Face service (separate terminal)
cd face-service && ./start.sh

# 4. Migrate existing uploads to MinIO (if any)
cd backend && npx tsx scripts/migrate-uploads-to-s3.ts

# 5. Frontend
cd frontend && npm install && npm run dev
```

Frontend dev server proxies API to `http://127.0.0.1:3000` (see `vite.config.ts`).

## Production deploy

```bash
./deploy/setup-server.sh   # once per server
./deploy/deploy-app.sh     # app deploy (PM2 + nginx + MinIO + face-service)
```

See [deploy/ANDROID_RELEASE.md](deploy/ANDROID_RELEASE.md) for signed Android APK.

## MinIO console

- API: `http://127.0.0.1:9000`
- Console: `http://127.0.0.1:9001` (login: `streakmeet` / `streakmeet_minio_secret`)

Requires a CPU with **x86-64-v2**. If MinIO cannot start locally, leave `S3_ENDPOINT` empty in `backend/.env` — the API will fall back to the `uploads/` folder until MinIO is available.
