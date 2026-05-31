-- Binary media stored in PostgreSQL (URLs stay /uploads/{filename} for API compatibility).
CREATE TABLE IF NOT EXISTS media_objects (
    key TEXT PRIMARY KEY,
    data BYTEA NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'image/avif',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_objects_created_at_idx ON media_objects (created_at);
