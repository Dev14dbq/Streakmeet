//! Image encode + PostgreSQL blob storage (`/uploads/{filename}` URLs unchanged).

mod images;
mod storage;

pub use images::{
    AVATAR_MAX_EDGE, DEFAULT_MAX_EDGE, SaveImageOptions, combine_remote_selfie_images,
    compute_photo_hash, get_object_buffer, hash_image_file, save_avatar_base64_as_avif,
    save_base64_image_as_avif, save_base64_image_as_avif_with_opts,
};
pub use storage::{ensure_media_schema, get_object_bytes, is_media_url, upload_avif, url_to_key};
