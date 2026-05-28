from __future__ import annotations

import base64
import logging
import time
from typing import List, Optional, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from insightface.app import FaceAnalysis
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("face-service")

face_app: Optional[FaceAnalysis] = None

# antelopev2 = SCRFD-10GF detector + glintr100 ArcFace recognizer.
# This is the strongest free InsightFace pack: best accuracy on tough angles,
# small/group faces and bad lighting. ~280MB, ~150-300ms/face on CPU.
MODEL_NAME = "antelopev2"
MODEL_VERSION = "antelopev2:v1"

MIN_DET_SCORE = 0.4
MIN_FACE_PX = 36
MIN_WIDTH = 320
MIN_HEIGHT = 240
DET_SIZE = (800, 800)


def ensure_min_size(img: np.ndarray) -> np.ndarray:
    """Upscale tiny frames instead of rejecting them (mobile WebView previews are often small)."""
    h, w = img.shape[:2]
    if w >= MIN_WIDTH and h >= MIN_HEIGHT:
        return img
    scale = max(MIN_WIDTH / max(w, 1), MIN_HEIGHT / max(h, 1))
    new_w = max(MIN_WIDTH, int(w * scale))
    new_h = max(MIN_HEIGHT, int(h * scale))
    log.info("upscaling image %dx%d -> %dx%d", w, h, new_w, new_h)
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)


def estimate_pose(kps: np.ndarray) -> Tuple[float, float]:
    """Rough yaw/pitch estimate from InsightFace 5-point landmarks.

    kps order: left_eye, right_eye, nose, left_mouth, right_mouth.
    Returns yaw in roughly [-1..+1] (negative = looking right in mirror coords)
    and pitch in roughly [-1..+1] (negative = looking down).
    """
    if kps is None or len(kps) < 5:
        return 0.0, 0.0
    le, re, nose, lm, rm = kps[0], kps[1], kps[2], kps[3], kps[4]
    eye_center_x = (le[0] + re[0]) / 2.0
    eye_center_y = (le[1] + re[1]) / 2.0
    mouth_center_y = (lm[1] + rm[1]) / 2.0
    eye_dist = float(np.linalg.norm(re - le))
    if eye_dist < 1e-3:
        return 0.0, 0.0
    yaw = float((nose[0] - eye_center_x) / eye_dist)
    face_h = max(mouth_center_y - eye_center_y, 1e-3)
    pitch_raw = (nose[1] - eye_center_y) / face_h
    pitch = float(pitch_raw - 0.5)
    return yaw, pitch


def crop_face_safe(img: np.ndarray, bbox: np.ndarray) -> Optional[np.ndarray]:
    h, w = img.shape[:2]
    x1, y1, x2, y2 = [int(round(v)) for v in bbox.tolist()]
    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(w, x2)
    y2 = min(h, y2)
    if x2 - x1 < 8 or y2 - y1 < 8:
        return None
    return img[y1:y2, x1:x2]


def blur_variance(face_crop: np.ndarray) -> float:
    """Laplacian variance — classic blur metric. Higher = sharper. <80 ≈ blurry."""
    if face_crop is None or face_crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def mean_brightness(face_crop: np.ndarray) -> float:
    if face_crop is None or face_crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
    return float(gray.mean())


def face_box_px(bbox: np.ndarray) -> float:
    x1, y1, x2, y2 = bbox.tolist()
    return float(min(x2 - x1, y2 - y1))


app = FastAPI(title="StreakMeet Face Service")


def _flatten_model_dir(model_dir: str) -> None:
    """InsightFace zip sometimes extracts into a nested subfolder — fix in place."""
    import os
    import shutil

    nested = os.path.join(model_dir, MODEL_NAME)
    if not os.path.isdir(nested):
        return
    for name in os.listdir(nested):
        src = os.path.join(nested, name)
        dst = os.path.join(model_dir, name)
        if os.path.exists(dst):
            continue
        shutil.move(src, dst)
    try:
        os.rmdir(nested)
    except OSError:
        pass


@app.on_event("startup")
def load_model() -> None:
    global face_app
    log.info("Loading InsightFace model %s...", MODEL_NAME)
    t0 = time.time()
    try:
        from insightface.utils import ensure_available

        model_dir = ensure_available("models", MODEL_NAME, root="~/.insightface")
        _flatten_model_dir(model_dir)
    except Exception as exc:
        log.warning("Could not pre-flatten model dir: %s", exc)

    analyzer = FaceAnalysis(
        name=MODEL_NAME,
        providers=["CPUExecutionProvider"],
        allowed_modules=["detection", "recognition"],
    )
    analyzer.prepare(ctx_id=-1, det_size=DET_SIZE, det_thresh=MIN_DET_SCORE)
    face_app = analyzer
    log.info("Model %s ready in %.1fs (det_size=%s)", MODEL_NAME, time.time() - t0, DET_SIZE)


class ImageRequest(BaseModel):
    image_base64: str = Field(..., min_length=32)


class BurstRequest(BaseModel):
    images_base64: List[str] = Field(..., min_length=1, max_length=24)


def decode_image(image_base64: str) -> np.ndarray:
    raw = image_base64.split(",", 1)[-1]
    try:
        data = base64.b64decode(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image") from exc

    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image")
    return img


def normalize_embedding(embedding: np.ndarray) -> list:
    vec = embedding.astype(np.float32)
    norm = float(np.linalg.norm(vec))
    if norm > 0:
        vec = vec / norm
    return vec.tolist()


def face_payload(face, img: np.ndarray) -> dict:
    bbox = face.bbox
    crop = crop_face_safe(img, bbox)
    yaw, pitch = estimate_pose(getattr(face, "kps", None))
    return {
        "embedding": normalize_embedding(face.embedding),
        "det_score": float(face.det_score),
        "bbox": [float(x) for x in bbox.tolist()],
        "face_px": face_box_px(bbox),
        "yaw": yaw,
        "pitch": pitch,
        "blur_var": blur_variance(crop) if crop is not None else 0.0,
        "brightness": mean_brightness(crop) if crop is not None else 0.0,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "model_loaded": face_app is not None,
    }


@app.post("/detect-faces")
def detect_faces(req: ImageRequest):
    if face_app is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t0 = time.time()
    img = decode_image(req.image_base64)
    img = ensure_min_size(img)
    h, w = img.shape[:2]

    faces = face_app.get(img)
    result = []
    for face in faces:
        if float(face.det_score) < MIN_DET_SCORE:
            continue
        if face_box_px(face.bbox) < MIN_FACE_PX:
            continue
        result.append(face_payload(face, img))

    log.info(
        "detect-faces %dx%d -> %d face(s) in %.0fms",
        w,
        h,
        len(result),
        (time.time() - t0) * 1000,
    )
    return {"faces": result, "width": w, "height": h, "model": MODEL_VERSION}


@app.post("/embed-face")
def embed_face(req: ImageRequest):
    """Single best-face embedding. Kept for backwards-compatibility."""
    if face_app is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t0 = time.time()
    img = decode_image(req.image_base64)
    img = ensure_min_size(img)
    h, w = img.shape[:2]

    faces = face_app.get(img)
    if not faces:
        raise HTTPException(status_code=400, detail="No face detected")

    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    if float(face.det_score) < MIN_DET_SCORE:
        raise HTTPException(status_code=400, detail="Face detection confidence too low")

    payload = face_payload(face, img)
    log.info(
        "embed-face %dx%d score=%.2f yaw=%.2f blur=%.0f in %.0fms",
        w,
        h,
        payload["det_score"],
        payload["yaw"],
        payload["blur_var"],
        (time.time() - t0) * 1000,
    )
    return payload


@app.post("/embed-burst")
def embed_burst(req: BurstRequest):
    """Embed best face from each frame in a burst.

    Returns one entry per input frame; entries can be empty (`face: null`)
    if no usable face was found, so the caller can keep indexes aligned with the
    client-side UI.
    """
    if face_app is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t0 = time.time()
    out: List[dict] = []
    for idx, image_b64 in enumerate(req.images_base64):
        try:
            img = decode_image(image_b64)
        except HTTPException as e:
            out.append({"index": idx, "face": None, "error": e.detail})
            continue
        img = ensure_min_size(img)
        faces = face_app.get(img)
        if not faces:
            out.append({"index": idx, "face": None, "error": "no_face"})
            continue

        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        if float(face.det_score) < MIN_DET_SCORE:
            out.append({"index": idx, "face": None, "error": "low_score"})
            continue
        if face_box_px(face.bbox) < MIN_FACE_PX:
            out.append({"index": idx, "face": None, "error": "too_small"})
            continue

        out.append({"index": idx, "face": face_payload(face, img), "error": None})

    elapsed_ms = (time.time() - t0) * 1000
    accepted = sum(1 for r in out if r["face"] is not None)
    log.info(
        "embed-burst %d frame(s) -> %d accepted in %.0fms",
        len(req.images_base64),
        accepted,
        elapsed_ms,
    )
    return {"results": out, "model": MODEL_VERSION}
