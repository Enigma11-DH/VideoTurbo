"""
VideoTurbo Python AI Worker
Consumes tasks from Redis queue and processes them.
"""
import json
import os
import sys
import time
import traceback
import redis

from tasks.video_render import VideoRenderTask
from tasks.ai_analysis import AIAnalysisTask
from tasks.platform_crawler import PlatformCrawlerTask
from tasks.pipeline import PipelineTask
from tasks.transcribe import TranscribeTask
from tasks.video_analyze import VideoAnalyzeTask
from tasks.beat_analyze import BeatAnalyzeTask
from tasks.auto_edit import AutoEditTask

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
QUEUE_KEY = "task:queue"


def get_redis():
    return redis.from_url(REDIS_URL, decode_responses=True)


def update_task_status(r: redis.Redis, task_id: str, status: str, progress: int = 0, **kwargs):
    """Update task status in Redis hash for real-time polling."""
    data = {"status": status, "progress": str(progress)}
    for k, v in kwargs.items():
        data[k] = str(v) if v is not None else ""
    r.hset(f"task:{task_id}", mapping=data)


def main():
    print("[Worker] VideoTurbo Python AI Worker starting...")
    r = get_redis()

    # Verify Redis connection
    try:
        r.ping()
        print(f"[Worker] Connected to Redis: {REDIS_URL}")
    except redis.ConnectionError:
        print(f"[Worker] ERROR: Cannot connect to Redis at {REDIS_URL}")
        sys.exit(1)

    handlers = {
        "render": VideoRenderTask(),
        "analyze": AIAnalysisTask(),
        "crawl": PlatformCrawlerTask(),
        "pipeline": PipelineTask(),
        "transcribe": TranscribeTask(),
        "video_analyze": VideoAnalyzeTask(),
        "beat_analyze": BeatAnalyzeTask(),
        "auto_edit": AutoEditTask(),
    }

    print(f"[Worker] Listening on queue: {QUEUE_KEY}")

    while True:
        try:
            # Block until a task is available (timeout 0 = wait forever)
            result = r.brpop(QUEUE_KEY, timeout=5)
            if result is None:
                continue

            _, raw_msg = result
            task = json.loads(raw_msg)

            task_id = task.get("taskId", "unknown")
            task_type = task.get("type", "unknown")
            print(f"[Worker] Received task: {task_id} (type={task_type})")

            handler = handlers.get(task_type)
            if not handler:
                print(f"[Worker] Unknown task type: {task_type}, skipping")
                update_task_status(r, task_id, "failed", error=f"Unknown task type: {task_type}")
                continue

            # Mark as processing
            update_task_status(r, task_id, "processing", progress=0)

            try:
                result_data = handler.execute(task, r)
                update_task_status(
                    r, task_id, "completed", progress=100,
                    result_url=result_data.get("url", ""),
                )
                print(f"[Worker] Task {task_id} completed successfully")
            except Exception as e:
                error_msg = f"{type(e).__name__}: {str(e)}"
                print(f"[Worker] Task {task_id} failed: {error_msg}")
                traceback.print_exc()
                update_task_status(r, task_id, "failed", error=error_msg)

        except KeyboardInterrupt:
            print("\n[Worker] Shutting down...")
            break
        except Exception as e:
            print(f"[Worker] Queue error: {e}")
            traceback.print_exc()
            time.sleep(2)


if __name__ == "__main__":
    main()
