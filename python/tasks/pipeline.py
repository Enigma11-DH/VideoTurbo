"""
Pipeline Task — End-to-end video generation pipeline.
Orchestrates: AI Analysis -> Asset Fetching -> FFmpeg Rendering
"""
import json
import os
import subprocess
import urllib.parse
import urllib.request

import redis

from tasks.video_render import VideoRenderTask
from utils.db import get_db, update_task
from utils.ffmpeg_helper import download_file
from utils.llm_adapter import adapter_from_payload

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", os.path.join(os.getcwd(), "output"))


class PipelineTask:
    """
    End-to-end pipeline:
      1. Call Gemini to generate a storyboard (scene list)
      2. For each scene, fetch real video URLs from Pexels
      3. Assemble a complete timeline and render via FFmpeg
    """

    def execute(self, task: dict, r: redis.Redis) -> dict:
        task_id = task["taskId"]
        payload = task.get("payload", {})

        topic = payload.get("topic", "")
        script = payload.get("script", "")
        duration = payload.get("duration", 30)
        aspect_ratio = payload.get("aspectRatio", "9:16")
        voice = payload.get("voice", "alloy")
        bgm = payload.get("bgm", "none")
        llm_base_url = payload.get("llmBaseUrl", "")
        llm_api_key  = payload.get("llmApiKey", "")
        llm_model    = payload.get("llmModel", "")
        pexels_api_key = payload.get("pexelsApiKey", "")
        user_assets = payload.get("assets", [])  # [{name, url}, ...]
        template_type = payload.get("templateType", "vlog")
        scene_hints   = payload.get("sceneHints", [])
        scene_count   = payload.get("sceneCount", 5)

        if not topic and not script:
            raise ValueError("Topic or script is required")

        job_dir = os.path.join(OUTPUT_DIR, task_id)
        os.makedirs(job_dir, exist_ok=True)

        # ====== Step 1: AI Analysis (0-30%) ======
        self._update(r, task_id, "pipeline_analyzing", 5)
        scenes = self._generate_storyboard(
            topic, script, duration, aspect_ratio, user_assets,
            llm_base_url, llm_api_key, llm_model,
            template_type, scene_hints, scene_count,
            r, task_id,
        )

        if not scenes:
            raise RuntimeError("AI analysis returned no scenes")

        # Store storyboard in Redis for frontend reference
        r.hset(f"task:{task_id}", "result_json", json.dumps(scenes, ensure_ascii=False))
        self._update(r, task_id, "pipeline_analyzing", 30)
        print(f"[Pipeline] Step 1 complete: {len(scenes)} scenes generated")

        # ====== Step 2: Fetch Assets (30-60%) ======
        self._update(r, task_id, "pipeline_fetching", 30)
        timeline = self._fetch_assets(
            scenes, pexels_api_key, aspect_ratio, user_assets, job_dir, r, task_id
        )

        if not timeline:
            raise RuntimeError("No valid clips after asset fetching")

        self._update(r, task_id, "pipeline_fetching", 60)
        print(f"[Pipeline] Step 2 complete: {len(timeline)} clips ready")

        # ====== Step 3: FFmpeg Render (60-100%) ======
        self._update(r, task_id, "pipeline_rendering", 60)

        # Build a render task payload and delegate to VideoRenderTask
        render_task = {
            "taskId": task_id,
            "payload": {
                "timeline": timeline,
                "pexelsApiKey": pexels_api_key,
            },
        }
        renderer = VideoRenderTask()
        # Override the renderer's internal progress to map 60-95%
        result = self._render_with_progress(renderer, render_task, r, task_id)

        self._update(r, task_id, "completed", 100)

        # Persist final result
        result_url = result.get("url", "")
        db = get_db()
        update_task(db, task_id, status="completed", progress=100, result_url=result_url)
        db.close()

        # Update Redis with final result_url
        r.hset(f"task:{task_id}", "result_url", result_url)

        print(f"[Pipeline] Complete: {result_url}")
        return result

    # ------------------------------------------------------------------
    # Step 1: LLM Storyboard Generation
    # ------------------------------------------------------------------

    def _generate_storyboard(
        self, topic: str, script: str, duration: int, aspect_ratio: str,
        user_assets: list, llm_base_url: str, llm_api_key: str, llm_model: str,
        template_type: str, scene_hints: list, scene_count: int,
        r: redis.Redis, task_id: str,
    ) -> list:
        adapter = adapter_from_payload({
            "llmBaseUrl": llm_base_url,
            "llmApiKey":  llm_api_key,
            "llmModel":   llm_model,
        })

        asset_names = [a.get("name", "unknown") for a in user_assets]
        orientation = "vertical (9:16 portrait)" if "9:16" in aspect_ratio else (
            "horizontal (16:9 landscape)" if "16:9" in aspect_ratio else "square (1:1)"
        )

        # Build template hint section
        template_hint = ""
        if template_type and template_type != "vlog":
            template_hint = f"\nVIDEO TYPE: {template_type}\n"
        if scene_hints:
            template_hint += f"SUGGESTED SCENE STRUCTURE: {', '.join(scene_hints)}\nUse this as a structural guide, adapting content to the topic.\n"
        elif scene_count:
            template_hint += f"TARGET SCENE COUNT: approximately {scene_count} scenes.\n"

        prompt = f"""You are an expert short-video editor specializing in viral content.

TASK: Create a detailed storyboard for a {duration}-second video.
TOPIC: "{topic}"
{"SCRIPT: " + script if script else ""}
ORIENTATION: {orientation}
USER VIDEOS: {', '.join(asset_names) if asset_names else 'None available'}
{template_hint}
RULES:
- Total duration of all scenes should sum to approximately {duration} seconds.
- Each scene needs a "searchQuery" in English for finding stock footage (be specific, e.g. "close up coffee pour slow motion" not just "coffee").
- Generate engaging text overlays in the same language as the topic.
- Keep it concise: 3-8 scenes max.
- If user videos are available, incorporate them as source="user".

Return ONLY a JSON array:
[
  {{
    "source": "user" or "platform",
    "assetName": "user video filename if source=user, else empty",
    "searchQuery": "specific English search query for stock video",
    "duration": <seconds as number>,
    "description": "what happens in this scene",
    "textOverlay": "text to display on screen, or empty string",
    "transition": "fade | zoom | glitch | swipe | none",
    "effect": "none"
  }}
]"""

        self._update(r, task_id, "pipeline_analyzing", 10)

        text = adapter.chat([{"role": "user", "content": prompt}])

        # Parse JSON, stripping markdown fences if present
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
            cleaned = cleaned.rsplit("```", 1)[0].strip()

        try:
            scenes = json.loads(cleaned)
        except json.JSONDecodeError as e:
            print(f"[Pipeline] JSON parse error: {e}\nRaw: {cleaned[:500]}")
            scenes = []

        return scenes if isinstance(scenes, list) else []

    # ------------------------------------------------------------------
    # Step 2: Fetch Real Video Assets from Pexels
    # ------------------------------------------------------------------

    def _fetch_assets(
        self, scenes: list, pexels_api_key: str, aspect_ratio: str,
        user_assets: list, job_dir: str, r: redis.Redis, task_id: str,
    ) -> list:
        """For each scene, resolve a real video URL."""
        timeline = []
        total = len(scenes)

        for idx, scene in enumerate(scenes):
            progress = 30 + int((idx / total) * 30)
            self._update(r, task_id, "pipeline_fetching", progress)

            source = scene.get("source", "platform")
            search_query = scene.get("searchQuery", "")
            asset_name = scene.get("assetName", "")

            video_url = ""

            # Try user asset first
            if source == "user" and user_assets:
                matched = next((a for a in user_assets if a.get("name") == asset_name), None)
                if matched:
                    video_url = matched.get("url", "")

            # Fetch from Pexels
            if not video_url and search_query and pexels_api_key:
                video_url = self._search_pexels(search_query, pexels_api_key, aspect_ratio)

            # Fallback: try a broader query
            if not video_url and pexels_api_key:
                fallback_query = scene.get("description", "nature landscape")[:50]
                video_url = self._search_pexels(fallback_query, pexels_api_key, aspect_ratio)

            if not video_url:
                print(f"[Pipeline] Scene {idx}: no video found for '{search_query}', skipping")
                continue

            timeline.append({
                "url": video_url,
                "duration": scene.get("duration", 5),
                "description": scene.get("description", ""),
                "source": source,
                "searchQuery": search_query,
                "textOverlay": scene.get("textOverlay", ""),
                "transition": scene.get("transition", "none"),
                "effect": scene.get("effect", "none"),
            })

        return timeline

    def _search_pexels(self, query: str, api_key: str, aspect_ratio: str = "9:16") -> str:
        """Search Pexels Videos API for a matching clip. Returns best HD URL or empty."""
        try:
            orientation = "portrait" if "9:16" in aspect_ratio else (
                "landscape" if "16:9" in aspect_ratio else "square"
            )
            encoded_q = urllib.parse.quote(query)
            url = (
                f"https://api.pexels.com/videos/search"
                f"?query={encoded_q}&per_page=5&orientation={orientation}"
            )
            req = urllib.request.Request(url, headers={"Authorization": api_key})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())

            videos = data.get("videos", [])
            for video in videos:
                files = video.get("video_files", [])
                # Prefer HD, then SD
                for quality in ("hd", "sd"):
                    for f in files:
                        if f.get("quality") == quality and f.get("link"):
                            return f["link"]
        except Exception as e:
            print(f"[Pipeline] Pexels search failed for '{query}': {e}")
        return ""

    # ------------------------------------------------------------------
    # Step 3: Render via VideoRenderTask
    # ------------------------------------------------------------------

    def _render_with_progress(
        self, renderer: VideoRenderTask, render_task: dict,
        r: redis.Redis, task_id: str,
    ) -> dict:
        """
        Execute VideoRenderTask but intercept its Redis progress updates
        to map them into the 60-95% range of our pipeline.
        We do this by running the renderer and periodically checking.
        For simplicity, just run it directly — it will update Redis itself.
        After it's done, we override with our final status.
        """
        # The renderer will write to task:{task_id} in Redis directly.
        # Its internal progress goes 0-100, but since it's using the same task_id,
        # we need to remap. Instead, let it run and we'll set final status after.
        result = renderer.execute(render_task, r)

        return result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _update(self, r: redis.Redis, task_id: str, status: str, progress: int):
        r.hset(f"task:{task_id}", mapping={
            "status": status,
            "progress": str(progress),
        })
