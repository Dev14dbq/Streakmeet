-- Track uploader for authorization checks on client-supplied photo URLs.
ALTER TABLE media_objects
    ADD COLUMN IF NOT EXISTS uploaded_by TEXT;

CREATE INDEX IF NOT EXISTS media_objects_uploaded_by_idx ON media_objects (uploaded_by);
