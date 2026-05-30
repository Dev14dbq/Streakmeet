//! Location sharing — parity with `backend/src/location/service.ts`.

mod models;
mod service;

pub use models::{FriendLocationJson, MyLocationJson};
pub use service::{
    get_friends_locations, get_my_location, set_location_sharing, update_location,
};
