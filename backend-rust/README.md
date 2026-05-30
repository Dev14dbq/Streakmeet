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
cargo run -p worker-service   # streak burn cron every 5 min
```

## Ports

| Service         | Port  | Role                                                 |
| --------------- | ----- | ---------------------------------------------------- |
| api-gateway     | 8080  | REST `/api/auth`, `/api/friends/*`, `/api/streaks/*` |
| sync-gateway    | 8081  | Connect JSON `SyncService` stream                    |
| auth-service    | 50051 | gRPC `AuthService.Login`                             |
| social-service  | 50053 | gRPC `SocialService` friends RPC                     |
| streaks-service | 50054 | gRPC `StreaksService` streak RPC                     |
| worker-service  | —     | Cron: streak burn → `streaks.burned` sync            |
| Node backend    | 3000  | Legacy (unchanged)                                   |

## Phase 1 — Sync + Friends

- [x] NATS publish to `sync.user.{userId}` (protobuf `SyncEnvelope`)
- [x] Transactional outbox (`sync_outbox`) + background retry worker
- [x] Friends: request / accept / list (REST on api-gateway + gRPC social-service)
- [x] Sync events: `friends.requested`, `friends.accepted` → both users
- [x] sync-gateway: NATS `sync.user.>` → in-memory fan-out (multi-device)
- [x] Connect-compatible HTTP layer for browser (`application/connect+json`)
- [x] CatchUp skeleton (reads from `sync_outbox` by `lastEventId`)
- [x] Frontend: `useSyncStream` + `applySyncEvent` patches `SWR_KEYS.friends`

## Phase 2 — Streaks + Worker

- [x] streaks-service + api-gateway REST: list, create, detail (by partner nickname)
- [x] Business rules: ACCEPTED friends only, no duplicate active pair, generous timezone
- [x] Sync: `streaks.created` → both users (`streakCreated` Connect JSON)
- [x] worker-service: burn at local 00:05–00:10 when `lastMetDate != yesterday`
- [x] Sync: `streaks.burned` → both users (`streakBurned` Connect JSON)
- [x] Frontend: patch `SWR_KEYS.streaks` + revalidate streak detail prefix
- [x] Friends reject/cancel REST stubs (no sync events yet)
- [ ] meet / magic-meet (TODO — Node still owns meet mutations)

### Browser path

sync-gateway speaks **Connect JSON** over HTTP (not raw tonic gRPC). Vite proxies `/connect` → `:8081`. Routes:

- `POST /connect/streakmeet.v1.SyncService/Subscribe`
- `POST /streakmeet.v1.SyncService/Subscribe` (direct)

Set `VITE_USE_SYNC_STREAM=true` in frontend `.env` to enable the stream and route friends/streaks API to `http://127.0.0.1:8080`.

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

## Frontend dev test

```bash
# frontend/.env.local
VITE_USE_SYNC_STREAM=true
VITE_RUST_GATEWAY_URL=http://127.0.0.1:8080
```

Open two browser profiles → login as A and B → A creates streak → B sees card on Home without refetch.

## Blockers / notes

- SQLx uses runtime queries (no compile-time DB verification yet).
- JWT must share `JWT_SECRET` with Node during transition.
- Meet / magic-meet / remote selfie still on Node backend.
- 1h/30m streak warning notifications not ported to worker (burn only).
- Friends reject/cancel: REST works; sync events deferred to Phase 3.
- Push notifications (FCM) not wired in Rust yet — sync events only.

## Phase 3 outline

- location-service + `location.updated` / `location.sharing_off` sync
- users-service: profile, avatar presigned upload
- friends reject/cancel/unfriend sync events
- meet + magic-meet in streaks-service + `streaks.meet_extended`
- CatchUp from JetStream consumer cursor
- Contract tests: Node JSON vs Rust JSON parity
