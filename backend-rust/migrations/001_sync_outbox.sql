-- Transactional outbox for sync events (Phase 1).
-- Apply once against the shared PostgreSQL database:
--   psql "$DATABASE_URL" -f backend-rust/migrations/001_sync_outbox.sql

CREATE TABLE IF NOT EXISTS sync_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    envelope_bytes BYTEA NOT NULL,
    event_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS sync_outbox_unpublished_idx
    ON sync_outbox (created_at)
    WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS sync_outbox_recipient_idx
    ON sync_outbox (recipient_user_id, created_at);

CREATE INDEX IF NOT EXISTS sync_outbox_event_id_idx
    ON sync_outbox (event_id);
