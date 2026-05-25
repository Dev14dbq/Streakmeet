import base64
import logging
import time
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from insightface.app import FaceAnalysis
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("face-service")

face_app: Optional[FaceAnalysis] = None
MODEL_NAME = "buffalo_sc"
MIN_DET_SCORE = 0.5
MIN_WIDTH = 320
MIN_HEIGHT = 240


def ensure_min_size(img: np.ndarray) -> np.ndarray:
    """Upscale tiny frames instead of rejecting them (mobile WebView often sends small previews)."""
    h, w = img.shape[:2]
    if w >= MIN_WIDTH and h >= MIN_HEIGHT:
        return img
    scale = max(MIN_WIDTH / max(w, 1), MIN_HEIGHT / max(h, 1))
    new_w = max(MIN_WIDTH, int(w * scale))
    new_h = max(MIN_HEIGHT, int(h * scale))
    log.info("upscaling image %dx%d -> %dx%d", w, h, new_w, new_h)
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

app = FastAPI(title="StreakMeet Face Service")


@app.on_event("startup")
def load_model() -> None:
    global face_app
    log.info("Loading InsightFace model %s...", MODEL_NAME)
    t0 = time.time()
    analyzer = FaceAnalysis(name=MODEL_NAME, providers=["CPUExecutionProvider"])
    analyzer.prepare(ctx_id=-1, det_size=(640, 640))
    face_app = analyzer
    log.info("Model ready in %.1fs", time.time() - t0)


class ImageRequest(BaseModel):
    image_base64: str = Field(..., min_length=32)


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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "model_loaded": face_app is not None,
    }


@app.post("/detect-faces")
def detect_faces(req: ImageRequest):
    if face_app is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t0 = time.time()
    img = decode_image(req.image_base64)
    h, w = img.shape[:2]
    img = ensure_min_size(img)
    h, w = img.shape[:2]

    faces = face_app.get(img)
    result = []
    for face in faces:
        score = float(face.det_score)
        if score < MIN_DET_SCORE:
            continue
        result.append(
            {
                "embedding": normalize_embedding(face.embedding),
                "det_score": score,
                "bbox": [float(x) for x in face.bbox.tolist()],
            }
        )

    log.info("detect-faces %dx%d -> %d face(s) in %.0fms", w, h, len(result), (time.time() - t0) * 1000)
    return {"faces": result, "width": w, "height": h}


@app.post("/embed-face")
def embed_face(req: ImageRequest):
    if face_app is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t0 = time.time()
    img = decode_image(req.image_base64)
    h, w = img.shape[:2]
    img = ensure_min_size(img)
    h, w = img.shape[:2]

    faces = face_app.get(img)
    if not faces:
        raise HTTPException(status_code=400, detail="No face detected")

    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    score = float(face.det_score)
    if score < MIN_DET_SCORE:
        raise HTTPException(status_code=400, detail="Face detection confidence too low")

    log.info("embed-face %dx%d score=%.2f in %.0fms", w, h, score, (time.time() - t0) * 1000)
    return {
        "embedding": normalize_embedding(face.embedding),
        "det_score": score,
        "bbox": [float(x) for x in face.bbox.tolist()],
    }
