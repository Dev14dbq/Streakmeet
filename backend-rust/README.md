# StreakMeet Backend (Rust)

Phase 0 foundation for the Rust microservices rewrite. See [rework-backend/](../rework-backend/README.md) for architecture.

## Prerequisites

- Rust stable (`rustup`, `clippy`, `rustfmt`)
- PostgreSQL, Redis, NATS (via docker-compose)
- Existing Prisma migrations applied (`backend/`)

## Quick start (dev)

```bash
# Infra: postgres + redis + minio + NATS JetStream
cd /home/streakmeet
docker compose -f docker-compose.yml -f docker-compose.rework.yml up -d

# Env
cp backend-rust/.env.example backend-rust/.env
# Edit JWT_SECRET to match backend/.env for token parity during migration

# Build all workspace crates/services
cd backend-rust
cargo build

# Run services (separate terminals)
cargo run -p api-gateway      # :8080 REST + /health
cargo run -p sync-gateway     # :8081 gRPC Subscribe stream
cargo run -p auth-service     # :50051 gRPC Login
```

## Ports

| Service       | Port  | Role                          |
|---------------|-------|-------------------------------|
| api-gateway   | 8080  | REST `/api/*`, `/health`      |
| sync-gateway  | 8081  | Connect/gRPC `SyncService`    |
| auth-service  | 50051 | gRPC `AuthService.Login`      |
| Node backend  | 3000  | Legacy (unchanged)            |

## Workspace layout

```
backend-rust/
  crates/
    streakmeet-types/   # Error codes, shared API types
    streakmeet-db/      # SQLx pool
    streakmeet-proto/   # Generated protobuf (tonic)
    streakmeet-auth/    # JWT + login logic
  services/
    api-gateway/
    sync-gateway/
    auth-service/
  proto/                # Buf proto definitions
```

## Phase 0 status

- [x] Workspace scaffold, shared crates, docker-compose.rework
- [x] Proto + sync-gateway heartbeat stream
- [x] Auth login (JWT HS256, bcrypt, same `users` table)
- [x] Frontend Connect client skeleton (`useSyncStream`)

## Phase 1 (next)

- social-service: friend request/accept + NATS publish
- sync-gateway: fan-out real domain events
- Frontend: patch friends cache from stream
- nginx split: `/connect/` → Rust, `/api/friends` → Rust

## Blockers / notes

- SQLx uses runtime queries (no compile-time DB verification yet).
- Connect browser client targets sync-gateway via Vite proxy `/connect/`.
- JWT must share `JWT_SECRET` with Node during transition.
- **protoc** required to build (`apt install protobuf-compiler` or newer from GitHub releases).
- sync-gateway speaks **tonic gRPC**; browser Connect JSON requires a Connect adapter or grpc-web proxy (Phase 1).
