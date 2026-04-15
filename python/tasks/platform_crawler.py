"""
Platform Crawler Task — Fetch content from external platforms (Douyin, Kuaishou, YouTube).
Skeleton implementation with Douyin parsing support.
"""
import json
import os
import re
import urllib.request

import redis

from utils.ffmpeg_helper import download_file
from utils.db import get_db, update_task


OUTPUT_DIR = os.environ.get("OUTPUT_DIR", os.path.join(os.getcwd(), "output"))


class PlatformCrawlerTask:
    """Crawl and download video content from external platforms."""

    def execute(self, task: dict, r: redis.Redis) -> dict:
        task_id = task["taskId"]
        payload = task.get("payload", {})
        platform = payload.get("platform", "douyin")
        url = payload.get("url", "")
        project_id = task.get("projectId", "")

        r.hset(f"task:{task_id}", mapping={"status": "crawling", "progress": "10"})

        if platform == "douyin":
            result = self._parse_douyin(url)
        elif platform == "kuaishou":
            result = self._parse_kuaishou(url)
        elif platform == "youtube":
            result = self._parse_youtube(url)
        else:
            raise ValueError(f"Unsupported platform: {platform}")

        if not result:
            raise RuntimeError(f"Failed to parse {platform} video from: {url}")

        r.hset(f"task:{task_id}", mapping={"status": "crawling", "progress": "50"})

        # Download the video
        job_dir = os.path.join(OUTPUT_DIR, task_id)
        os.makedirs(job_dir, exist_ok=True)
        video_path = os.path.join(job_dir, "crawled.mp4")

        video_url = result.get("video_url", "")
        if video_url:
            download_file(video_url, video_path)
            result["local_path"] = video_path
            result["result_url"] = f"/output/{task_id}/crawled.mp4"

        r.hset(f"task:{task_id}", mapping={"status": "crawling", "progress": "90"})

        # Store metadata in Redis
        r.hset(f"task:{task_id}", "result_json", json.dumps(result, ensure_ascii=False))

        # Persist to SQLite
        db = get_db()
        update_task(
            db, task_id,
            status="completed",
            progress=100,
            result_url=result.get("result_url", ""),
        )
        db.close()

        return {"url": result.get("result_url", "")}

    def _parse_douyin(self, url: str) -> dict | None:
        """Parse Douyin short video URL to extract video info."""
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            }
            # Follow redirect to get real URL
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                final_url = resp.url

            # Extract item ID
            match = re.search(r"video/(\d+)", final_url)
            if not match:
                return None
            item_id = match.group(1)

            # Fetch item info
            detail_url = f"https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids={item_id}"
            req = urllib.request.Request(detail_url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())

            items = data.get("item_list", [])
            if not items:
                return None

            item = items[0]
            video_url = item["video"]["play_addr"]["url_list"][0]
            video_url = video_url.replace("playwm", "play")

            return {
                "video_url": video_url,
                "title": item.get("desc", ""),
                "cover": item["video"]["cover"]["url_list"][0],
                "author": item.get("author", {}).get("nickname", ""),
                "platform": "douyin",
            }
        except Exception as e:
            print(f"[Crawler] Douyin parse error: {e}")
            return None

    def _parse_kuaishou(self, url: str) -> dict | None:
        """Parse Kuaishou video URL. Skeleton — requires API integration."""
        print(f"[Crawler] Kuaishou parsing not yet implemented: {url}")
        return None

    def _parse_youtube(self, url: str) -> dict | None:
        """Parse YouTube video URL. Skeleton — requires yt-dlp integration."""
        print(f"[Crawler] YouTube parsing not yet implemented: {url}")
        return None
