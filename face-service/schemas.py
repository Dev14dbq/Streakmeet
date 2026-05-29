from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class ImageRequest(BaseModel):
    image_base64: str = Field(..., min_length=32)


class BurstRequest(BaseModel):
    images_base64: List[str] = Field(..., min_length=1, max_length=24)
