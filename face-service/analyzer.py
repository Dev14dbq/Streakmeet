from __future__ import annotations

import logging
import os
import shutil
import time
from typing import Optional

from insightface.app import FaceAnalysis

log = logging.getLogger("face-service")

# antelopev2 = SCRFD-10GF detector + glintr100 ArcFace recognizer.
# This is the strongest free InsightFace pack: best accuracy on tough angles,
# small/group faces and bad lighting. ~280MB, ~150-300ms/face on CPU.
MODEL_NAME = "antelopev2"
MODEL_VERSION = "antelopev2:v1"

MIN_DET_SCORE = 0.4
MIN_FACE_PX = 36
DET_SIZE = (800, 800)

_analyzer: Optional[FaceAnalysis] = None


def _flatten_model_dir(model_dir: str) -> None:
    """InsightFace zip sometimes extracts into a nested subfolder — fix in place."""
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


def load_analyzer() -> None:
    global _analyzer
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
    _analyzer = analyzer
    log.info("Model %s ready in %.1fs (det_size=%s)", MODEL_NAME, time.time() - t0, DET_SIZE)


def get_analyzer() -> FaceAnalysis:
    if _analyzer is None:
        raise RuntimeError("Model not loaded")
    return _analyzer
