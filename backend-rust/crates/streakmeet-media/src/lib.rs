//! Image storage — parity with `backend/src/storage/images.ts` + `media.ts`.

mod images;
mod storage;

pub use images::{
    combine_remote_selfie_images, compute_photo_hash, get_object_buffer, hash_image_file,
    save_base64_image_as_avif,
};
