//! User profile — parity with `backend/src/users/service.ts`.

mod models;
mod service;

pub use models::{PublicProfileJson, SearchUserJson, UpdateProfileInput};
pub use service::{
    delete_account, get_profile, get_public_photos, get_public_profile, list_photos, search_users,
    update_email, update_password, update_preferences, update_profile, update_settings,
    upload_avatar,
};
