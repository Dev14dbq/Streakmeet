//! Image storage — parity with `backend/src/storage/images.ts` + `media.ts`.

mod images;
mod storage;

pub use images::{compute_photo_hash, save_base64_image_as_avif};
