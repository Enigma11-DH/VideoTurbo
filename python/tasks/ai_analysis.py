"""
AI Analysis Task — Uses LLM API to analyze assets and generate storyboards.
"""
import json
import os
import logging

import redis

from utils.db import get_db, update_task
from utils.json_utils import safe_parse_json_array, extract_json_from_llm_response

logger = logging.getLogger(__name__)


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

            logger.info(f"[AI Analysis] LLM response received (length: {len(result_text)})")
            logger.debug(f"[AI Analysis] Raw response preview: {result_text[:300]}...")

            # Use robust JSON parser with multiple fallback strategies
            scenes = safe_parse_json_array(result_text, context=f"ai_analysis:{task_id}")

            if not scenes:
                # Save raw response for debugging
                debug_file = os.path.join(os.environ.get("OUTPUT_DIR", os.getcwd()), "debug", f"{task_id}_analysis_response.txt")
                os.makedirs(os.path.dirname(debug_file), exist_ok=True)
                try:
                    with open(debug_file, 'w', encoding='utf-8') as f:
                        f.write(f"Task ID: {task_id}\n")
                        f.write(f"Timestamp: {__import__('datetime').datetime.now()}\n")
                        f.write(f"Response length: {len(result_text)}\n")
                        f.write("="*80 + "\n\n")
                        f.write("RAW LLM RESPONSE:\n")
                        f.write(result_text)
                    logger.error(f"[AI Analysis] JSON parse failed. Raw response saved to: {debug_file}")
                except Exception as e:
                    logger.warning(f"[AI Analysis] Failed to save debug file: {e}")

                logger.error(f"[AI Analysis] Failed to generate storyboard from LLM response")

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
