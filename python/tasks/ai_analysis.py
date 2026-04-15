"""
AI Analysis Task — Uses Gemini API to analyze assets and generate storyboards.
"""
import json
import os

import redis

from utils.db import get_db, update_task


class AIAnalysisTask:
    """Analyze video assets and generate editing storyboards using Gemini."""

    def execute(self, task: dict, r: redis.Redis) -> dict:
        task_id = task["taskId"]
        payload = task.get("payload", {})
        topic = payload.get("topic", "")
        assets = payload.get("assets", [])
        gemini_api_key = payload.get("geminiApiKey", "")

        r.hset(f"task:{task_id}", mapping={"status": "analyzing", "progress": "10"})

        if not gemini_api_key:
            raise ValueError("Gemini API key is required for AI analysis")

        try:
            import google.generativeai as genai

            genai.configure(api_key=gemini_api_key)
            model = genai.GenerativeModel("gemini-2.0-flash")

            asset_names = [a.get("name", "unknown") for a in assets]
            prompt = f"""
Act as an expert TikTok video editor and viral content analyzer.
Theme/Topic: "{topic}"
Available uploaded videos: {', '.join(asset_names) if asset_names else 'None'}

Create a storyboard for a short, engaging video (approx 15-45s).
Mix user's uploaded videos (if any) with footage that needs to be fetched from stock video platforms.
Generate catchy, viral-style text overlays (captions) for each clip.
For each clip, suggest a CapCut effect ID (e.g., 'vibrate', 'zoom_in', 'glitch', 'none').

Return ONLY a JSON array of scenes:
[
  {{
    "source": "user" or "platform",
    "assetName": "name of user video if source is user, otherwise empty",
    "searchQuery": "search query for stock video if source is platform",
    "duration": <number in seconds>,
    "description": "what happens in this scene",
    "textOverlay": "catchy text to display or empty",
    "transition": "fade | zoom | glitch | swipe | none",
    "effect": "CapCut effect ID or none"
  }}
]
"""

            r.hset(f"task:{task_id}", mapping={"status": "analyzing", "progress": "30"})

            response = model.generate_content(prompt)
            result_text = response.text or "[]"

            # Try to parse as JSON
            try:
                # Strip markdown code fences if present
                cleaned = result_text.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("\n", 1)[1]
                    cleaned = cleaned.rsplit("```", 1)[0]
                scenes = json.loads(cleaned)
            except json.JSONDecodeError:
                scenes = []

            r.hset(f"task:{task_id}", mapping={"status": "analyzing", "progress": "90"})

            # Persist result
            db = get_db()
            result_json = json.dumps(scenes, ensure_ascii=False)
            update_task(db, task_id, status="completed", progress=100, result_url="")
            # Store analysis result in Redis for frontend to fetch
            r.hset(f"task:{task_id}", "result_json", result_json)
            db.close()

            return {"url": "", "scenes": scenes}

        except ImportError:
            raise RuntimeError(
                "google-generativeai package not installed. "
                "Run: pip install google-generativeai"
            )
