from __future__ import annotations

import logging
import time
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from insightface.app import FaceAnalysis

from analyzer import get_analyzer, MODEL_NAME, MODEL_VERSION, MIN_DET_SCORE, MIN_FACE_PX
from image_utils import decode_image, ensure_min_size, face_box_px, face_payload
from schemas import BurstRequest, ImageRequest

log = logging.getLogger("face-service")
router = APIRouter()


def require_analyzer() -> FaceAnalysis:
    try:
        return get_analyzer()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Model not loaded")


@router.get("/health")
def health():
    from analyzer import _analyzer as _a
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "model_loaded": _a is not None,
    }


@router.post("/detect-faces")
def detect_faces(req: ImageRequest, analyzer: FaceAnalysis = Depends(require_analyzer)):
    t0 = time.time()
    img = decode_image(req.image_base64)
    img = ensure_min_size(img)
    h, w = img.shape[:2]

    faces = analyzer.get(img)
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


@router.post("/embed-face")
def embed_face(req: ImageRequest, analyzer: FaceAnalysis = Depends(require_analyzer)):
    """Single best-face embedding. Kept for backwards-compatibility."""
    t0 = time.time()
    img = decode_image(req.image_base64)
    img = ensure_min_size(img)
    h, w = img.shape[:2]

    faces = analyzer.get(img)
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


@router.post("/embed-burst")
def embed_burst(req: BurstRequest, analyzer: FaceAnalysis = Depends(require_analyzer)):
    """Embed best face from each frame in a burst.

    Returns one entry per input frame; entries can be empty (`face: null`)
    if no usable face was found, so the caller can keep indexes aligned with the
    client-side UI.
    """
    t0 = time.time()
    out: List[dict] = []
    for idx, image_b64 in enumerate(req.images_base64):
        try:
            img = decode_image(image_b64)
        except HTTPException as e:
            out.append({"index": idx, "face": None, "error": e.detail})
            continue
        img = ensure_min_size(img)
        faces = analyzer.get(img)
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
