//! Face service HTTP client — parity with `backend/src/face/service.ts`.

use reqwest::Client;
use serde::Deserialize;
use streakmeet_types::{codes, ApiError};

fn current_face_model() -> String {
    std::env::var("FACE_MODEL_TAG").unwrap_or_else(|_| "antelopev2:v1".into())
}
const EMBEDDING_DIM: usize = 512;

const MIN_INPUT_FRAMES: usize = 3;
const MAX_INPUT_FRAMES: usize = 16;
pub const MIN_ACCEPTED_EMBEDDINGS: usize = 4;

#[derive(Debug, Deserialize)]
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
struct BurstResultItem {
    index: i32,
    face: Option<FaceQuality>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BurstResponse {
    results: Vec<BurstResultItem>,
    #[allow(dead_code)]
    model: String,
}

struct EnrollQualityThresholds {
    min_det_score: f64,
    min_blur_var: f64,
    max_yaw_abs: f64,
    max_pitch_abs: f64,
    min_brightness: f64,
    max_brightness: f64,
}

const ENROLL_QUALITY: EnrollQualityThresholds = EnrollQualityThresholds {
    min_det_score: 0.7,
    min_blur_var: 60.0,
    max_yaw_abs: 0.5,
    max_pitch_abs: 0.4,
    min_brightness: 35.0,
    max_brightness: 240.0,
};

fn face_service_url() -> String {
    std::env::var("FACE_SERVICE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8001".into())
        .trim_end_matches('/')
        .to_string()
}

fn passes_enroll_quality(face: &FaceQuality) -> Result<(), &'static str> {
    let t = &ENROLL_QUALITY;
    if face.det_score < t.min_det_score {
        return Err("low_det_score");
    }
    if face.blur_var < t.min_blur_var {
        return Err("blurry");
    }
    if face.yaw.abs() > t.max_yaw_abs {
        return Err("too_much_yaw");
    }
    if face.pitch.abs() > t.max_pitch_abs {
        return Err("too_much_pitch");
    }
    if face.brightness < t.min_brightness {
        return Err("too_dark");
    }
    if face.brightness > t.max_brightness {
        return Err("too_bright");
    }
    if face.embedding.len() != EMBEDDING_DIM {
        return Err("bad_embedding_dim");
    }
    Ok(())
}

pub async fn ensure_face_service() -> Result<(), ApiError> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|_| ApiError::new(500, codes::FACE_SERVICE_ERROR, None))?;

    let url = format!("{}/health", face_service_url());
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|_| ApiError::new(500, codes::FACE_SERVICE_ERROR, None))?;

    if !resp.status().is_success() {
        return Err(ApiError::new(500, codes::FACE_SERVICE_ERROR, None));
    }

    let data: serde_json::Value = resp.json().await.unwrap_or_default();
    if !data.get("model_loaded").and_then(|v| v.as_bool()).unwrap_or(false) {
        return Err(ApiError::new(500, codes::FACE_SERVICE_ERROR, None));
    }
    Ok(())
}

async fn embed_burst_from_base64(photos: &[String]) -> Result<Vec<BurstResultItem>, ApiError> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|_| ApiError::new(500, codes::FACE_SERVICE_ERROR, None))?;

    let url = format!("{}/embed-burst", face_service_url());
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "images_base64": photos }))
        .send()
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "[face] burst request failed");
            ApiError::new(500, codes::FACE_SERVICE_ERROR, None)
        })?;

    let status = resp.status();
    let data: serde_json::Value = resp.json().await.unwrap_or_default();

    if !status.is_success() {
        let msg = data
            .get("detail")
            .or_else(|| data.get("error"))
            .and_then(|v| v.as_str())
            .unwrap_or("Face service error");
        tracing::error!(msg, "[face] burst error");
        return Err(ApiError::new(500, codes::FACE_SERVICE_ERROR, Some(msg)));
    }

    let burst: BurstResponse = serde_json::from_value(data)
        .map_err(|_| ApiError::new(500, codes::FACE_SERVICE_ERROR, None))?;
    Ok(burst.results)
}

#[derive(Debug, serde::Serialize)]
pub struct EnrollFaceResult {
    pub success: bool,
    pub accepted: usize,
    pub total: usize,
}

struct AcceptedEmbedding {
    vector: Vec<f64>,
    det_score: f64,
    yaw: f64,
    pitch: f64,
    blur_var: f64,
}

pub async fn enroll_face(
    pool: &sqlx::PgPool,
    user_id: &str,
    photos: &[String],
) -> Result<EnrollFaceResult, ApiError> {
    if photos.is_empty() {
        return Err(ApiError::new(400, codes::PHOTOS_REQUIRED, None));
    }
    if photos.len() < MIN_INPUT_FRAMES || photos.len() > MAX_INPUT_FRAMES {
        return Err(ApiError::new(400, codes::FACE_ENROLL_TOO_FEW_FRAMES, None));
    }
    for photo in photos {
        if !photo.starts_with("data:image/") {
            return Err(ApiError::new(400, codes::INVALID_PHOTO, None));
        }
    }

    ensure_face_service().await?;
    let results = embed_burst_from_base64(photos).await?;

    let mut accepted: Vec<AcceptedEmbedding> = Vec::new();
    let mut reasons: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();

    for r in &results {
        let Some(face) = &r.face else {
            let key = r.error.as_deref().unwrap_or("no_face").to_string();
            let count = reasons.get(&key).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
            reasons.insert(key, serde_json::json!(count));
            continue;
        };
        if let Err(reason) = passes_enroll_quality(face) {
            let count = reasons
                .get(reason)
                .and_then(|v| v.as_i64())
                .unwrap_or(0)
                + 1;
            reasons.insert(reason.to_string(), serde_json::json!(count));
            continue;
        };
        accepted.push(AcceptedEmbedding {
            vector: face.embedding.clone(),
            det_score: face.det_score,
            yaw: face.yaw,
            pitch: face.pitch,
            blur_var: face.blur_var,
        });
    }

    tracing::info!(
        user_id,
        frames = photos.len(),
        accepted = accepted.len(),
        ?reasons,
        "[enroll-face]"
    );

    if accepted.len() < MIN_ACCEPTED_EMBEDDINGS {
        return Err(ApiError {
            status: 400,
            body: streakmeet_types::ApiErrorBody {
                error: streakmeet_types::default_message(codes::FACE_ENROLL_LOW_QUALITY).into(),
                code: codes::FACE_ENROLL_LOW_QUALITY.into(),
                extra: Some(serde_json::json!({
                    "accepted": accepted.len(),
                    "needed": MIN_ACCEPTED_EMBEDDINGS,
                    "reasons": reasons,
                })),
            },
        });
    }

    let mut tx = pool
        .begin()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    sqlx::query(r#"DELETE FROM face_embeddings WHERE "userId" = $1"#)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    for a in &accepted {
        let vector_json = serde_json::to_value(&a.vector)
            .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
        let id = streakmeet_types::new_cuid()?;
        sqlx::query(
            r#"
            INSERT INTO face_embeddings
                (id, "userId", vector, "detScore", yaw, pitch, "blurVar", "faceModel", source)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'enrollment')
            "#,
        )
        .bind(&id)
        .bind(user_id)
        .bind(vector_json)
        .bind(a.det_score)
        .bind(a.yaw)
        .bind(a.pitch)
        .bind(a.blur_var)
        .bind(&current_face_model())
        .execute(&mut *tx)
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;
    }

    sqlx::query(
        r#"
        UPDATE users
        SET "faceEnrolled" = true, "faceModel" = $1, "faceEnrolledAt" = NOW()
        WHERE id = $2
        "#,
    )
    .bind(&current_face_model())
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    tx.commit()
        .await
        .map_err(|_| ApiError::new(500, codes::INTERNAL_ERROR, None))?;

    Ok(EnrollFaceResult {
        success: true,
        accepted: accepted.len(),
        total: photos.len(),
    })
}
