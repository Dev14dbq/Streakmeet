# StreakMeet Backend (Rust)

Phase 0–1 foundation for the Rust microservices rewrite. See [rework-backend/](../rework-backend/README.md) for architecture.

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
cargo run -p api-gateway      # :8080 REST + /api/friends/*
cargo run -p sync-gateway     # :8081 Connect JSON stream + NATS fan-out
cargo run -p auth-service     # :50051 gRPC Login (optional; login also on gateway)
cargo run -p social-service   # :50053 gRPC SocialService (optional; friends also on gateway)
```

## Ports

| Service        | Port  | Role                                     |
| -------------- | ----- | ---------------------------------------- |
| api-gateway    | 8080  | REST `/api/auth/login`, `/api/friends/*` |
| sync-gateway   | 8081  | Connect JSON `SyncService` stream        |
| auth-service   | 50051 | gRPC `AuthService.Login`                 |
| social-service | 50053 | gRPC `SocialService` friends RPC         |
| Node backend   | 3000  | Legacy (unchanged)                       |

## Phase 1 — Sync + Friends

- [x] NATS publish to `sync.user.{userId}` (protobuf `SyncEnvelope`)
- [x] Transactional outbox (`sync_outbox`) + background retry worker
- [x] Friends: request / accept / list (REST on api-gateway + gRPC social-service)
- [x] Sync events: `friends.requested`, `friends.accepted` → both users
- [x] sync-gateway: NATS `sync.user.>` → in-memory fan-out (multi-device)
- [x] Connect-compatible HTTP layer for browser (`application/connect+json`)
- [x] CatchUp skeleton (reads from `sync_outbox` by `lastEventId`)
- [x] Frontend: `useSyncStream` + `applySyncEvent` patches `SWR_KEYS.friends`

### Browser path

sync-gateway speaks **Connect JSON** over HTTP (not raw tonic gRPC). Vite proxies `/connect` → `:8081`. Routes:

- `POST /connect/streakmeet.v1.SyncService/Subscribe`
- `POST /streakmeet.v1.SyncService/Subscribe` (direct)

Set `VITE_USE_SYNC_STREAM=true` in frontend `.env` to enable the stream and route friends API to `http://127.0.0.1:8080`.

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

### 3. User A — send friend request

```bash
TOKEN_A=...
FRIEND_ID=<user B id>
curl -s http://127.0.0.1:8080/api/friends/request \
  -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' \
  -d "{\"friendId\":\"$FRIEND_ID\"}"
```

User B's stream should receive a `friendEvent` with `eventType: "friends.requested"` within ~500ms.

### 4. Accept (user B)

```bash
FRIENDSHIP_ID=<from request response>
curl -s http://127.0.0.1:8080/api/friends/accept \
  -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' \
  -d "{\"friendshipId\":\"$FRIENDSHIP_ID\"}"
```

Both streams receive `friends.accepted` with `status: "ACCEPTED"`.

### 5. List friends

```bash
curl -s http://127.0.0.1:8080/api/friends/ \
  -H "Authorization: Bearer $TOKEN_A" | jq
```

## Frontend dev test

```bash
# frontend/.env.local
VITE_USE_SYNC_STREAM=true
VITE_RUST_GATEWAY_URL=http://127.0.0.1:8080
```

Open two browser profiles → login as A and B → A sends request → B sees incoming request without refetch.

## Blockers / notes

- SQLx uses runtime queries (no compile-time DB verification yet).
- JWT must share `JWT_SECRET` with Node during transition.
- Friends REST on api-gateway duplicates social-service gRPC (intentional for migration shim).
- Raw gRPC from browser still needs grpc-web proxy; use Connect JSON path above.
- Push notifications (FCM) not wired in Rust yet — sync events only.

## Phase 2 suggestions

- streaks-service + `streaks.created` / `streaks.burned` sync
- Reject / cancel / unfriend RPC + sync events
- CatchUp from JetStream consumer ack cursor (not just outbox)
- Idempotency-Key on gateway unary mutations
- Contract tests: Node JSON vs Rust JSON parity
