//! User profile — parity with `backend/src/users/service.ts`.

mod models;
mod service;

pub use models::{PublicProfileJson, SearchUserJson, UpdateProfileInput};
pub use service::{
    get_profile, get_public_profile, search_users, update_profile, upload_avatar,
};
