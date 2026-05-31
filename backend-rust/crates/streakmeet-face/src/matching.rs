//! Face candidate pool for magic meet — parity with `backend/src/face/matching.ts`.

use crate::service::{FaceQuality, detect_faces_from_base64};
use streakmeet_types::ApiError;

pub const MAGIC_MEET_MAX_FRAMES: usize = 5;

#[derive(Debug, Clone)]
pub struct FaceCandidate {
    pub frame_index: usize,
    pub face_index_in_frame: usize,
    pub embedding: Vec<f64>,
    pub det_score: f64,
    pub bbox_area: f64,
}

fn face_to_candidate(
    frame_index: usize,
    face_index_in_frame: usize,
    d: &FaceQuality,
) -> FaceCandidate {
    let bbox_area = if d.bbox.len() >= 4 {
        let x1 = d.bbox[0];
        let y1 = d.bbox[1];
        let x2 = d.bbox[2];
        let y2 = d.bbox[3];
        ((x2 - x1) * (y2 - y1)).max(0.0)
    } else {
        0.0
    };
    FaceCandidate {
        frame_index,
        face_index_in_frame,
        embedding: d.embedding.clone(),
        det_score: d.det_score,
        bbox_area,
    }
}

pub async fn collect_face_candidates(photos: &[String]) -> Result<Vec<FaceCandidate>, ApiError> {
    let mut out = Vec::new();
    for (frame_idx, photo) in photos.iter().enumerate() {
        let detections = detect_faces_from_base64(photo).await?;
        for (i, d) in detections.iter().enumerate() {
            out.push(face_to_candidate(frame_idx, i, d));
        }
    }
    Ok(out)
}

/// Pick the frame with the highest sum of det_score that contains the user's face.
pub fn pick_best_frame(pool: &[FaceCandidate], user_candidate_idx: usize) -> Option<usize> {
    if pool.is_empty() {
        return None;
    }
    let user_frame = pool.get(user_candidate_idx).map(|c| c.frame_index);
    let mut score_by_frame: std::collections::HashMap<usize, f64> =
        std::collections::HashMap::new();
    for c in pool {
        *score_by_frame.entry(c.frame_index).or_insert(0.0) += c.det_score;
    }
    if let Some(f) = user_frame
        && score_by_frame.contains_key(&f)
    {
        return Some(f);
    }
    score_by_frame
        .into_iter()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(f, _)| f)
}
