"""
Video Render Task — FFmpeg-based video rendering pipeline.
Migrated from server.ts background rendering logic.
"""
import json
import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import redis

from utils.ffmpeg_helper import (
    concat_videos,
    combine_video_audio,
    probe_duration,
    download_file,
)
from utils.db import get_db, update_task


OUTPUT_DIR = os.environ.get("OUTPUT_DIR", os.path.join(os.getcwd(), "output"))


class VideoRenderTask:
    """Consume a render task from Redis queue and produce a final MP4."""

    def execute(self, task: dict, r: redis.Redis) -> dict:
        task_id = task["taskId"]
        payload = task.get("payload", {})
        timeline = payload.get("timeline", [])
        pexels_api_key = payload.get("pexelsApiKey", "")

        if not timeline:
            raise ValueError("Timeline is empty")

        # Create job directory
        job_dir = os.path.join(OUTPUT_DIR, task_id)
        os.makedirs(job_dir, exist_ok=True)

        processed_clips: list[str] = []
        total = len(timeline)

        for idx, clip in enumerate(timeline):
            progress = int((idx / total) * 80)
            r.hset(f"task:{task_id}", mapping={
                "status": "rendering",
                "progress": str(progress),
            })

            video_url = clip.get("url", "")
            search_query = clip.get("searchQuery", "")
            text_overlay = clip.get("textOverlay", "")

            # If platform asset with search query, try Pexels
            if clip.get("source") == "platform" and search_query and pexels_api_key:
                pexels_url = self._search_pexels(search_query, pexels_api_key)
                if pexels_url:
                    video_url = pexels_url

            if not video_url:
                print(f"[Render] Clip {idx}: no video URL, skipping")
                continue

            # Download raw clip
            raw_path = os.path.join(job_dir, f"raw_{idx}.mp4")
            print(f"[Render] Downloading clip {idx}: {video_url[:80]}...")
            download_file(video_url, raw_path)

            # If text overlay exists, generate TTS and combine
            if text_overlay:
                tts_path = os.path.join(job_dir, f"tts_{idx}.mp3")
                combined_path = os.path.join(job_dir, f"combined_{idx}.mp4")

                self._generate_tts(text_overlay, tts_path)
                combine_video_audio(raw_path, tts_path, combined_path)
                processed_clips.append(combined_path)
            else:
                processed_clips.append(raw_path)

        if not processed_clips:
            raise RuntimeError("No clips were processed successfully")

        # Concatenate all clips
        r.hset(f"task:{task_id}", mapping={"status": "rendering", "progress": "85"})
        final_path = os.path.join(job_dir, "final.mp4")
        print(f"[Render] Concatenating {len(processed_clips)} clips...")

        if len(processed_clips) == 1:
            # Just rename/copy single clip
            os.replace(processed_clips[0], final_path)
        else:
            concat_videos(processed_clips, final_path, job_dir)

        result_url = f"/output/{task_id}/final.mp4"

        # Persist to SQLite
        db = get_db()
        update_task(db, task_id, status="completed", progress=100, result_url=result_url)
        db.close()

        return {"url": result_url}

    def _search_pexels(self, query: str, api_key: str) -> str | None:
        """Search Pexels for a stock video matching the query."""
        try:
            import urllib.parse
            url = f"https://api.pexels.com/videos/search?query={urllib.parse.quote(query)}&per_page=1"
            req = urllib.request.Request(url, headers={"Authorization": api_key})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            videos = data.get("videos", [])
            if videos:
                files = videos[0].get("video_files", [])
                for f in files:
                    if f.get("quality") in ("hd", "sd"):
                        return f.get("link")
        except Exception as e:
            print(f"[Render] Pexels search failed: {e}")
        return None

    def _generate_tts(self, text: str, output_path: str):
        """Generate TTS audio using Google TTS (gTTS)."""
        try:
            from gtts import gTTS
            tts = gTTS(text=text, lang="zh-cn")
            tts.save(output_path)
        except ImportError:
            # Fallback: create a silent audio file
            print("[Render] gTTS not available, creating silent audio placeholder")
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi", "-i",
                "anullsrc=r=44100:cl=mono", "-t", "3",
                "-q:a", "9", output_path
            ], capture_output=True)
        except Exception as e:
            print(f"[Render] TTS generation failed: {e}")
            # Create silent placeholder
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi", "-i",
                "anullsrc=r=44100:cl=mono", "-t", "3",
                "-q:a", "9", output_path
            ], capture_output=True)
