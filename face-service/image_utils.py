from __future__ import annotations

import base64
import logging
from typing import Optional, Tuple

import cv2
import numpy as np
from fastapi import HTTPException

log = logging.getLogger("face-service")

# Minimum dimensions before upscaling (mobile WebView previews are often small).
MIN_WIDTH = 320
MIN_HEIGHT = 240


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
