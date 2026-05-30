# StreakMeet Backend (Rust)

Phase 0–2 foundation for the Rust microservices rewrite. See [rework-backend/](../rework-backend/README.md) for architecture.

## Prerequisites

- Rust stable (`rustup`, `clippy`, `rustfmt`)
- PostgreSQL, Redis, NATS (via docker-compose)
- Existing Prisma migrations applied (`backend/`)
- **protoc** (`apt install protobuf-compiler`)

## Quick start (dev)

```bash
# Infra: postgres + redis + minio + NATS JetStream
cd /home/streakmeet
docker compose -f docker-compose.yml -f docker-compose.rework.yml up -d

# Outbox table (once)
psql "$DATABASE_URL" -f backend-rust/migrations/001_sync_outbox.sql

# Env
cp backend-rust/.env.example backend-rust/.env
# Edit JWT_SECRET to match backend/.env for token parity during migration

cd backend-rust
cargo build

# Run services (separate terminals)
cargo run -p api-gateway      # :8080 REST + /api/friends/* + /api/streaks/*
cargo run -p sync-gateway     # :8081 Connect JSON stream + NATS fan-out
cargo run -p auth-service     # :50051 gRPC Login (optional; login also on gateway)
cargo run -p social-service   # :50053 gRPC SocialService (optional)
cargo run -p streaks-service  # :50054 gRPC StreaksService (optional)
cargo run -p worker-service   # streak warnings + burn + remote selfie expiry every 5 min
```

## Ports

| Service         | Port  | Role                                                 |
| --------------- | ----- | ---------------------------------------------------- |
| api-gateway     | 8080  | REST `/api/auth`, `/api/friends/*`, `/api/streaks/*`, `/api/memories`, `/api/legal`, `/uploads/*` |
| sync-gateway    | 8081  | Connect JSON `SyncService` stream                    |
| auth-service    | 50051 | gRPC `AuthService.Login`                             |
| social-service  | 50053 | gRPC `SocialService` friends RPC                     |
| streaks-service | 50054 | gRPC `StreaksService` streak RPC                     |
| worker-service  | —     | Cron: 1h/30m warnings, burn, remote selfie expiry    |
| Node backend    | 3000  | Legacy (unchanged)                                   |

## Phase 1 — Sync + Friends

- [x] NATS publish to `sync.user.{userId}` (protobuf `SyncEnvelope`)
- [x] Transactional outbox (`sync_outbox`) + background retry worker
- [x] Friends: request / accept / list (REST on api-gateway + gRPC social-service)
- [x] Sync events: `friends.requested`, `friends.accepted` → both users
- [x] sync-gateway: JetStream durable consumer → in-memory fan-out (multi-device)
- [x] Connect-compatible HTTP layer for browser (`application/connect+json`)
- [x] CatchUp RPC: `sync_outbox` + JetStream supplement by `lastEventId`
- [x] Frontend: `useSyncStream` + `applySyncEvent` patches `SWR_KEYS.friends`

## Phase 2 — Streaks + Worker

- [x] streaks-service + api-gateway REST: list, create, detail (by partner nickname)
- [x] Business rules: ACCEPTED friends only, no duplicate active pair, generous timezone
- [x] Sync: `streaks.created` → both users (`streakCreated` Connect JSON)
- [x] worker-service: 1h/30m warnings at local 23:00 / 23:30 when not met today
- [x] Sync: `notifications.streak_*` → `notification` Connect JSON (dedup via `streak_notification_logs`)
- [x] worker-service: burn at local 00:05–00:10 when `lastMetDate != yesterday`
- [x] Sync: `streaks.burned` → both users (`streakBurned` Connect JSON)
- [x] worker-service: expire PENDING remote selfies after 24h → `remoteSelfieCleared`
- [x] Frontend: patch `SWR_KEYS.streaks` + revalidate streak detail prefix
- [x] Friends reject/cancel/unfriend + sync events
- [x] meet stub + magic-meet + remote selfie (Rust; requires face-service on :8001)

## Phase 4 — Auth + advanced streaks (partial)

- [x] register, check-email, OAuth Google/Apple, verify-email, forgot/reset password
- [x] enroll-face, restore-account, resend-verification
- [x] magic-meet, remote selfie, streak meet sync events
- [x] memories feed (`GET /api/memories`)
- [x] legal consent + documents (`/api/legal/*`)
- [x] users settings, preferences, email/password, photos
- [x] media uploads serve (`GET /uploads/*`) — MinIO/S3 with local fallback
- [x] `deploy/nginx-streakmeet-rust.conf` — Rust `/api/*` + `/connect/*`, Node socket.io fallback
- [x] `deploy/ecosystem-rust.config.cjs` — PM2 for api/sync/worker + Node fallback
- [x] `scripts/contract-parity.sh` — Node :3000 vs Rust :8080 friends/streaks parity

### Browser path

sync-gateway speaks **Connect JSON** over HTTP (not raw tonic gRPC). Vite proxies `/connect` → `:8081`. Routes:

- `POST /connect/streakmeet.v1.SyncService/Subscribe`
- `POST /streakmeet.v1.SyncService/Subscribe` (direct)

Default frontend mode is **`VITE_USE_SYNC_STREAM=auto`**: probes `http://127.0.0.1:8080/health` and `:8081/health` in dev; uses Connect + Rust REST when both respond. Force Node-only with `VITE_USE_SYNC_STREAM=false` or `VITE_DEV_RUST_PROXY=false` (Vite `/api` → :3000).

## Frontend testing (Connect sync)

### Prerequisites

- Rust `api-gateway` (:8080) and `sync-gateway` (:8081) running
- `JWT_SECRET` matches Node `backend/.env`
- Optional: Node on :3000 only if Rust gateways are down

### Dev env (`frontend/.env.local`)

```bash
VITE_USE_SYNC_STREAM=auto
# VITE_RUST_GATEWAY_URL=          # empty → same-origin /api (Vite → :8080)
# VITE_CONNECT_URL=/connect
```

Node-only dev (no Rust):

```bash
VITE_USE_SYNC_STREAM=false
VITE_DEV_RUST_PROXY=false
```

### Checklist

1. **Probe** — Open app; console should show `[sync] stream connected` when logged in (not with `false`).
2. **Login** — Email login hits Rust when auto/true (`/api/auth/login` via proxy).
3. **Friends** — User A requests B; B’s Home friend list updates without refresh (sync `friendEvent`).
4. **Streaks** — A creates streak with B; B sees new card (`streakCreated`).
5. **Burn** — Worker or manual SQL; both get `streakBurned`, count → 0 in list.
6. **Map** — With sync on, Map does not open Socket.IO; friend pins update from `locationUpdated` / SWR `friendLocations`.
7. **Fallback** — Stop Rust gateways, reload; app uses Socket.IO + Node (`VITE_USE_SYNC_STREAM=false` or failed probe).

### Production Node-only

Set `VITE_USE_SYNC_STREAM=false` and `VITE_API_URL` to the Node API. Do not set `VITE_RUST_GATEWAY_URL` unless Rust is deployed.

## Manual test flow

### 1. Login (get tokens for user A and B)

```bash
curl -s http://127.0.0.1:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"userA@example.com","password":"..."}' | jq -r .accessToken
```

### 2. User B — open sync stream

```bash
TOKEN_B=...
curl -N http://127.0.0.1:8081/connect/streakmeet.v1.SyncService/Subscribe \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/connect+json" \
  -H "Connect-Protocol-Version: 1" \
  -d '{"lastEventId":""}'
```

### 3. User A — create streak with B (must be ACCEPTED friends)

```bash
TOKEN_A=...
PARTNER_ID=<user B id>
curl -s http://127.0.0.1:8080/api/streaks/ \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d "{\"partnerId\":\"$PARTNER_ID\"}" | jq
```

User B's stream should receive `streakCreated` with full `streak` object within ~500ms.

### 4. List streaks

```bash
curl -s http://127.0.0.1:8080/api/streaks/ \
  -H "Authorization: Bearer $TOKEN_B" | jq
```

### 5. Worker burn test (manual DB setup)

Burn runs when local time in `Streak.timezone` is **00:05–00:09** and `lastMetDate` is not yesterday.

```sql
-- Pick an active streak with count > 0
UPDATE streaks SET
  count = 5,
  "lastMetDate" = '2020-01-01',
  timezone = 'UTC'
WHERE id = '<streak-id>';
```

Then either wait for the 5-minute worker tick or run `cargo run -p worker-service` and temporarily lower the interval in code for dev. Both users' streams should get `streakBurned` with `count: 0`.

To force UTC midnight window without waiting: set `timezone = 'UTC'` and run the worker between 00:05–00:09 UTC.

### 6. Friends flow (unchanged from Phase 1)

See Phase 1 steps for request/accept; reject/cancel:

```bash
curl -s http://127.0.0.1:8080/api/friends/reject \
  -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' \
  -d '{"friendshipId":"<id>"}'
```

### 7. Memories, legal, users, uploads

```bash
TOKEN=...  # from login

# Legal status + accept
curl -s http://127.0.0.1:8080/api/legal/status/me -H "Authorization: Bearer $TOKEN" | jq
curl -s -X POST http://127.0.0.1:8080/api/legal/accept -H "Authorization: Bearer $TOKEN" | jq
curl -s 'http://127.0.0.1:8080/api/legal/terms?locale=en' | jq '.slug,.version,.title'

# Memories feed (requires 7+ MET streak days)
curl -s 'http://127.0.0.1:8080/api/memories/?page=1&limit=20' \
  -H "Authorization: Bearer $TOKEN" | jq '.unlocked,.items|length'
curl -s 'http://127.0.0.1:8080/api/memories/?streakId=<streak-id>' \
  -H "Authorization: Bearer $TOKEN" | jq

# User settings / preferences / photos
curl -s -X PATCH http://127.0.0.1:8080/api/users/settings \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"timezone":"Europe/Moscow"}' | jq '.timezone'
curl -s -X PATCH http://127.0.0.1:8080/api/users/preferences \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"notifyFriends":true,"notifyMeet":true,"geoOnPhotos":false}' | jq '.notifyFriends'
curl -s 'http://127.0.0.1:8080/api/users/photos?page=1&limit=12' \
  -H "Authorization: Bearer $TOKEN" | jq 'length'
curl -s 'http://127.0.0.1:8080/api/public/users/<nickname>/photos?page=1' | jq 'length'

# Uploaded media (AVIF)
curl -sI http://127.0.0.1:8080/uploads/<filename>.avif | grep -i content-type
```

## Frontend dev test (quick)

```bash
# frontend/.env.local — auto is enough when Rust is up
VITE_USE_SYNC_STREAM=auto
```

Open two browser profiles → login as A and B → A creates streak → B sees card on Home without refetch.

### CatchUp (offline replay)

```bash
TOKEN_B=...
curl -N http://127.0.0.1:8081/connect/streakmeet.v1.SyncService/CatchUp \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/connect+json" \
  -H "Connect-Protocol-Version: 1" \
  -d '{"lastEventId":"<last-seen-event-id>"}'
```

Returns missed events from `sync_outbox`, supplemented from JetStream when needed.

### Idempotency (POST mutations)

Send `Idempotency-Key: <uuid>` on friend request/accept/reject/cancel and streak create.
Replays within 24h return the cached response (`X-Idempotency-Replayed: true`).
Uses Redis when `REDIS_URL` is set; otherwise in-memory per process.

## Blockers / notes

- SQLx uses runtime queries (no compile-time DB verification yet).
- JWT must share `JWT_SECRET` with Node during transition.
- **face-service** (Python :8001) required for magic-meet / enroll-face.
- Legal locale packs beyond en/ru use English fallback (Node has full `locales.extra.ts`).
- `MEMORIES_DEV_MODE` placeholder feed not ported.
- Contract parity script requires both backends; set `CONTRACT_EMAIL`/`CONTRACT_PASSWORD` for existing users.
- Push notifications (FCM) not wired — sync events only.
- MinIO may be down locally; media falls back to `/tmp/streakmeet-uploads`.

## Phase 5 — Sync hardening

- [x] JetStream stream `SYNC_USER` (`sync.user.>`) with 7-day retention
- [x] Durable pull consumer `sync-gateway-fanout` (ack + redelivery)
- [x] CatchUp: outbox-first, JetStream supplement, dedupe by `eventId`
- [x] Multi-device: `broadcast` channel per user room (256 capacity)
- [x] Idempotency-Key on `POST /api/friends/*` mutations + `POST /api/streaks/`
- [ ] contract tests, FCM background wake, nginx production cutover
