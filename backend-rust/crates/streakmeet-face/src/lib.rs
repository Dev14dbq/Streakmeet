//! Face detection HTTP client + cosine similarity — parity with `backend/src/face/`.

mod matching;
mod service;

pub use matching::{
    FaceCandidate, MAGIC_MEET_MAX_FRAMES, collect_face_candidates, pick_best_frame,
};
pub use service::{
    CURRENT_FACE_MODEL, EMBEDDING_DIM, FACE_MATCH_THRESHOLD_PARTNER, FACE_MATCH_THRESHOLD_SELF,
    FaceQuality, FaceVsGalleryResult, MatchResult, best_face_match_in_gallery, cosine_similarity,
    detect_faces_from_base64, embed_burst_from_base64, ensure_face_service,
    face_error_from_exception, face_match_threshold_partner, face_match_threshold_self,
    is_valid_embedding, match_against_gallery,
};
