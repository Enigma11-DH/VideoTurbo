"""
routers/transcribe.py — Multipart upload route for Whisper transcription.

Endpoint mirrors the existing Node.js route exactly.

POST /api/transcribe   — Whisper speech-to-text + optional subtitle burn
"""
from __future__ import annotations

import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from api.deps import get_redis, get_memory
from api.agent.memory import MemoryManager
from api.routers.analyze import _save_upload, _enqueue  # reuse helpers
import redis as redis_lib

router = APIRouter(tags=["Transcribe"])

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/uploads")


@router.post("/api/transcribe")
async def transcribe(
    video: UploadFile | None = File(default=None),
    videoPath: str | None = Form(default=None),
    burnSubtitles: str = Form(default="false"),
    language: str = Form(default=""),
    r: redis_lib.Redis = Depends(get_redis),
    memory: MemoryManager = Depends(get_memory),
):
    """
    Submit a Whisper transcription task.

    Accepts either:
      - multipart file upload (field name: video)
      - existing server-side path (field name: videoPath)

    Optional fields:
      - burnSubtitles : "true" | "false"  (default: "false")
      - language      : ISO 639-1 code e.g. "zh", "en"  (default: auto-detect)
    """
    if video is not None:
        path = await _save_upload(video, os.path.join(UPLOAD_DIR, "video"))
    elif videoPath:
        path = videoPath
    else:
        raise HTTPException(status_code=400, detail="video file or videoPath required")

    payload: dict = {
        "videoPath": path,
        "burnSubtitles": burnSubtitles.lower() == "true",
    }
    if language:
        payload["language"] = language

    task_id = str(uuid.uuid4())
    _enqueue(r, task_id, "transcribe", payload)
    memory.record_task(task_id, "transcribe")

    return {"taskId": task_id}
