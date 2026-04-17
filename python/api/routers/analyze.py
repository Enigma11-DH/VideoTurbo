"""
routers/analyze.py — Multipart upload routes for video/audio analysis.

Endpoints mirror the existing Node.js routes exactly so the frontend
can switch to FastAPI with zero code changes.

POST /api/video-analyze   — OpenCV video analysis (multipart: video field)
POST /api/beat-analyze    — librosa beat analysis  (multipart: audio field)
"""
from __future__ import annotations

import os
import uuid
import shutil

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from api.deps import get_redis, get_memory
from api.agent.memory import MemoryManager
import redis as redis_lib

router = APIRouter(tags=["Analysis"])

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/uploads")
QUEUE_KEY = "task:queue"


# ---------------------------------------------------------------------------
# Helper: save upload to disk, enqueue task
# ---------------------------------------------------------------------------

async def _save_upload(file: UploadFile, dest_dir: str) -> str:
    """Save an uploaded file to dest_dir and return the absolute path."""
    os.makedirs(dest_dir, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1] or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(dest_dir, filename)

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    return file_path


def _enqueue(r: redis_lib.Redis, task_id: str, task_type: str, payload: dict) -> None:
    """Push task to Redis queue and initialise status hash."""
    import json
    msg = json.dumps({"taskId": task_id, "type": task_type, "payload": payload}, ensure_ascii=False)
    r.lpush(QUEUE_KEY, msg)
    r.hset(f"task:{task_id}", mapping={"status": "queued", "progress": "0", "type": task_type})


# ---------------------------------------------------------------------------
# POST /api/video-analyze
# ---------------------------------------------------------------------------

@router.post("/api/video-analyze")
async def video_analyze(
    video: UploadFile | None = File(default=None),
    videoPath: str | None = Form(default=None),
    sampleInterval: int = Form(default=15),
    r: redis_lib.Redis = Depends(get_redis),
    memory: MemoryManager = Depends(get_memory),
):
    """
    Submit an OpenCV video analysis task.

    Accepts either:
      - multipart file upload (field name: video)
      - existing server-side path (field name: videoPath)
    """
    if video is not None:
        path = await _save_upload(video, os.path.join(UPLOAD_DIR, "video"))
    elif videoPath:
        path = videoPath
    else:
        raise HTTPException(status_code=400, detail="video file or videoPath required")

    task_id = str(uuid.uuid4())
    _enqueue(r, task_id, "video_analyze", {"videoPath": path, "sampleInterval": sampleInterval})
    memory.record_task(task_id, "video_analyze")

    return {"taskId": task_id}


# ---------------------------------------------------------------------------
# POST /api/beat-analyze
# ---------------------------------------------------------------------------

@router.post("/api/beat-analyze")
async def beat_analyze(
    audio: UploadFile | None = File(default=None),
    audioPath: str | None = Form(default=None),
    everyNBeats: int = Form(default=2),
    r: redis_lib.Redis = Depends(get_redis),
    memory: MemoryManager = Depends(get_memory),
):
    """
    Submit a librosa beat-analysis task.

    Accepts either:
      - multipart file upload (field name: audio)
      - existing server-side path (field name: audioPath)
    """
    if audio is not None:
        path = await _save_upload(audio, os.path.join(UPLOAD_DIR, "audio"))
    elif audioPath:
        path = audioPath
    else:
        raise HTTPException(status_code=400, detail="audio file or audioPath required")

    task_id = str(uuid.uuid4())
    _enqueue(r, task_id, "beat_analyze", {"audioPath": path, "everyNBeats": everyNBeats})
    memory.record_task(task_id, "beat_analyze")

    return {"taskId": task_id}
