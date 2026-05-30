//! HTTP client to Python face-service + embedding math.

use std::time::Duration;

use serde::Deserialize;
use streakmeet_types::{codes, ApiError};

pub const FACE_MATCH_THRESHOLD_SELF: f64 = {
    // Overridden at runtime via env; default matches Node.
    0.42
};
pub const FACE_MATCH_THRESHOLD_PARTNER: f64 = 0.38;
pub const CURRENT_FACE_MODEL: &str = "antelopev2:v1";
pub const EMBEDDING_DIM: usize = 512;

#[derive(Debug, Clone, Deserialize)]
pub struct FaceQuality {
    pub embedding: Vec<f64>,
    pub det_score: f64,
    pub yaw: f64,
    pub pitch: f64,
    pub blur_var: f64,
    pub brightness: f64,
    pub face_px: f64,
    pub bbox: Vec<f64>,
}

#[derive(Debug, Deserialize)]
struct DetectFacesResponse {
    faces: Vec<FaceQuality>,
    width: u32,
    height: u32,
    model: String,
}

#[derive(Debug, Deserialize)]
struct BurstResultItem {
    index: usize,
    face: Option<FaceQuality>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BurstResponse {
    results: Vec<BurstResultItem>,
    model: String,
}

#[derive(Debug, Deserialize)]
struct HealthResponse {
    model_loaded: Option<bool>,
}

fn face_service_url() -> String {
    std::env::var("FACE_SERVICE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8001".into())
        .trim_end_matches('/')
        .to_string()
}

fn threshold_self() -> f64 {
    std::env::var("FACE_MATCH_THRESHOLD_SELF")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(FACE_MATCH_THRESHOLD_SELF)
}

fn threshold_partner() -> f64 {
    std::env::var("FACE_MATCH_THRESHOLD_PARTNER")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(FACE_MATCH_THRESHOLD_PARTNER)
}

pub fn face_match_threshold_self() -> f64 {
    threshold_self()
}

pub fn face_match_threshold_partner() -> f64 {
    threshold_partner()
}

async fn face_service_post<T: for<'de> Deserialize<'de>>(
    path: &str,
    body: &impl serde::Serialize,
) -> Result<T, ApiError> {
    let url = format!("{}{}", face_service_url(), path);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let res = client
        .post(&url)
        .json(body)
        .send()
        .await
        .map_err(|_| ApiError::new(500, codes::FACE_SERVICE_ERROR, None))?;

    let status = res.status();
    let data: serde_json::Value = res
        .json()
        .await
        .unwrap_or(serde_json::json!({}));

    if !status.is_success() {
        let msg = data
            .get("detail")
            .or_else(|| data.get("error"))
            .and_then(|v| v.as_str())
            .unwrap_or("Face service error");
        return Err(ApiError::new(
            500,
            codes::FACE_SERVICE_ERROR,
            Some(msg),
        ));
    }

    serde_json::from_value(data).map_err(|_| ApiError::new(500, codes::FACE_SERVICE_ERROR, None))
}

pub async fn ensure_face_service() -> Result<(), ApiError> {
    let url = format!("{}/health", face_service_url());
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|_| ApiError::new(500, codes::FACE_SERVICE_ERROR, Some("Face service unreachable")))?;

    if !res.status().is_success() {
        return Err(ApiError::new(
            500,
            codes::FACE_SERVICE_ERROR,
            Some("Face service unhealthy"),
        ));
    }

    let data: HealthResponse = res
        .json()
        .await
        .map_err(|_| ApiError::new(500, codes::FACE_SERVICE_ERROR, None))?;

    if data.model_loaded != Some(true) {
        return Err(ApiError::new(
            500,
            codes::FACE_SERVICE_ERROR,
            Some("Face service model not loaded yet"),
        ));
    }
    Ok(())
}

pub async fn detect_faces_from_base64(photo_base64: &str) -> Result<Vec<FaceQuality>, ApiError> {
    let t0 = std::time::Instant::now();
    let data: DetectFacesResponse = face_service_post(
        "/detect-faces",
        &serde_json::json!({ "image_base64": photo_base64 }),
    )
    .await?;
    tracing::debug!(
        width = data.width,
        height = data.height,
        faces = data.faces.len(),
        ms = t0.elapsed().as_millis(),
        "face detect"
    );
    Ok(data.faces)
}

pub async fn embed_burst_from_base64(photos: &[String]) -> Result<Vec<BurstResultItem>, ApiError> {
    if photos.is_empty() {
        return Ok(vec![]);
    }
    let t0 = std::time::Instant::now();
    let data: BurstResponse = face_service_post(
        "/embed-burst",
        &serde_json::json!({ "images_base64": photos }),
    )
    .await?;
    let ok = data.results.iter().filter(|r| r.face.is_some()).count();
    tracing::debug!(
        frames = photos.len(),
        ok,
        ms = t0.elapsed().as_millis(),
        "face burst"
    );
    Ok(data.results)
}

pub fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() {
        return 0.0;
    }
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

#[derive(Debug, Clone, Copy)]
pub struct MatchResult {
    pub best_sim: f64,
    pub best_idx: i32,
}

pub fn match_against_gallery(probe: &[f64], gallery: &[Vec<f64>]) -> MatchResult {
    let mut best_sim = f64::NEG_INFINITY;
    let mut best_idx = -1i32;
    for (i, g) in gallery.iter().enumerate() {
        let sim = cosine_similarity(probe, g);
        if sim > best_sim {
            best_sim = sim;
            best_idx = i as i32;
        }
    }
    if best_idx == -1 {
        MatchResult {
            best_sim: -1.0,
            best_idx: -1,
        }
    } else {
        MatchResult {
            best_sim,
            best_idx,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct FaceVsGalleryResult {
    pub face_index: i32,
    pub gallery_index: i32,
    pub sim: f64,
}

pub fn best_face_match_in_gallery(probes: &[Vec<f64>], gallery: &[Vec<f64>]) -> FaceVsGalleryResult {
    let mut best = FaceVsGalleryResult {
        face_index: -1,
        gallery_index: -1,
        sim: -1.0,
    };
    for (i, probe) in probes.iter().enumerate() {
        let m = match_against_gallery(probe, gallery);
        if m.best_sim > best.sim {
            best = FaceVsGalleryResult {
                face_index: i as i32,
                gallery_index: m.best_idx,
                sim: m.best_sim,
            };
        }
    }
    best
}

pub fn is_valid_embedding(embedding: &serde_json::Value) -> Option<Vec<f64>> {
    let arr = embedding.as_array()?;
    if arr.len() != EMBEDDING_DIM {
        return None;
    }
    let mut out = Vec::with_capacity(EMBEDDING_DIM);
    for v in arr {
        out.push(v.as_f64()?);
    }
    Some(out)
}

pub fn face_error_from_exception(err: &ApiError) -> ApiError {
    let msg = err.body.error.to_lowercase();
    if msg.contains("no face") || msg.contains("не найдено") {
        return ApiError::new(500, codes::FACE_NOT_DETECTED, None);
    }
    if msg.contains("503") || msg.contains("unhealthy") || msg.contains("unreachable") {
        return ApiError::new(
            500,
            codes::FACE_SERVICE_ERROR,
            Some("Сервис распознавания лиц временно недоступен"),
        );
    }
    if err.body.code == codes::FACE_NOT_DETECTED {
        return err.clone();
    }
    ApiError::new(500, codes::FACE_SERVICE_ERROR, None)
}
