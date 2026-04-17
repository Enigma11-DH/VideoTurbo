"""
AutoEditTask
~~~~~~~~~~~~
Unified "smart edit" pipeline: OpenCV clip analysis → librosa beat analysis
→ template-aware clip selection → track JSON draft generation.

Progress stages
---------------
  5%  — Pre-flight checks
 20%  — Stage 1: OpenCV analysis of all video/image clips
 40%  — Stage 2: librosa beat analysis (if audio provided)
 65%  — Stage 3: Template-aware clip ranking + beat alignment
 85%  — Stage 4: Build draft JSON
 95%  — Stage 5: Write draft to disk, update Redis
100%  — Done
"""
from __future__ import annotations

import json
import os
import shutil
import traceback
from typing import Any

import cv2

from utils.cv_helper import (
    get_video_info,
    score_frame_quality,
    detect_shot_changes,
)
from utils.audio_helper import (
    load_audio,
    analyze_beats,
)
from utils.draft_builder import (
    align_clips_to_beats,
    template_sort,
    build_draft,
)

try:
    import urllib.request
    import json as _json
    _LLM_AVAILABLE = True
except ImportError:
    _LLM_AVAILABLE = False

# --------------------------------------------------------------------------- #
# Constants                                                                     #
# --------------------------------------------------------------------------- #

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/app/output")
SAMPLE_INTERVAL = 15          # analyse every N-th frame for speed
MOTION_THRESHOLD_HIGH = 0.55  # optical-flow mean > this → "high"
MOTION_THRESHOLD_LOW  = 0.20  # optical-flow mean < this → "low"

# Supported image extensions (treated as static 2-second clips)
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}


# --------------------------------------------------------------------------- #
# AutoEditTask                                                                  #
# --------------------------------------------------------------------------- #

class AutoEditTask:
    """
    End-to-end auto-edit pipeline.

    Worker contract: handler.execute(task_dict, redis_client) → {"url": str}
    """

    def execute(self, task: dict, r) -> dict:
        payload  = task.get("payload", {})
        task_id  = task.get("taskId", "unknown")

        video_paths   = payload.get("video_paths", [])
        audio_path    = payload.get("audio_path")       # may be None
        aspect_ratio  = payload.get("aspect_ratio",  "9:16")
        duration_sec  = float(payload.get("duration_sec", 30))
        template      = payload.get("template",      "vlog")
        # reference_url: not yet processed (placeholder for future yt-dlp)

        # LLM config (passed through from frontend, memory-only)
        llm_config    = payload.get("llm_config", {})
        llm_base_url  = llm_config.get("base_url", "")
        llm_api_key   = llm_config.get("api_key", "")
        llm_model     = llm_config.get("model", "")

        if llm_base_url and llm_api_key:
            print(f"[AutoEdit] LLM available: {llm_base_url} model={llm_model}")
        else:
            print("[AutoEdit] No LLM config provided — skipping AI generation")

        work_dir = os.path.join(OUTPUT_DIR, task_id)
        os.makedirs(work_dir, exist_ok=True)

        # Temp files created during processing (cleaned up at the end)
        temp_files: list[str] = []

        try:
            # ---------------------------------------------------------------- #
            # Pre-flight                                                        #
            # ---------------------------------------------------------------- #
            r.hset(f"task:{task_id}", mapping={"status": "auto_editing", "progress": "5"})

            existing_paths = [p for p in video_paths if os.path.exists(p)]
            if not existing_paths:
                raise FileNotFoundError("No valid video/image files found in payload")

            print(f"[AutoEdit] task={task_id} clips={len(existing_paths)} "
                  f"audio={bool(audio_path)} template={template} "
                  f"ratio={aspect_ratio} dur={duration_sec}s")

            # ---------------------------------------------------------------- #
            # Stage 1: OpenCV clip analysis                                     #
            # ---------------------------------------------------------------- #
            r.hset(f"task:{task_id}", mapping={"progress": "10"})
            clips_scored: list[dict[str, Any]] = []

            for idx, clip_path in enumerate(existing_paths):
                ext = os.path.splitext(clip_path)[1].lower()
                print(f"[AutoEdit] Analysing clip {idx + 1}/{len(existing_paths)}: "
                      f"{os.path.basename(clip_path)}")

                if ext in IMAGE_EXTS:
                    clips_scored.append(_analyse_image(clip_path))
                else:
                    clips_scored.append(_analyse_video(clip_path))

                # Incremental progress update within stage 1
                pct = 10 + int((idx + 1) / len(existing_paths) * 20)
                r.hset(f"task:{task_id}", mapping={"progress": str(pct)})

            r.hset(f"task:{task_id}", mapping={"progress": "30"})

            # ---------------------------------------------------------------- #
            # Stage 2: librosa beat analysis                                    #
            # ---------------------------------------------------------------- #
            beat_times: list[float] = []
            tempo_bpm  = 0.0

            if audio_path and os.path.exists(audio_path):
                r.hset(f"task:{task_id}", mapping={"progress": "32"})
                print(f"[AutoEdit] Beat analysis: {os.path.basename(audio_path)}")
                try:
                    y, sr = load_audio(audio_path)
                    beat_report = analyze_beats(y, sr)
                    beat_times  = beat_report.get("beat_times", [])
                    tempo_bpm   = beat_report.get("tempo", 0.0)
                    print(f"[AutoEdit] BPM={tempo_bpm:.1f}, "
                          f"beats={len(beat_times)}")
                except Exception as exc:
                    print(f"[AutoEdit] Beat analysis failed (non-fatal): {exc}")

            r.hset(f"task:{task_id}", mapping={"progress": "40"})

            # ---------------------------------------------------------------- #
            # Stage 2.5: LLM script generation (if LLM configured)             #
            # ---------------------------------------------------------------- #
            llm_script: dict[str, Any] | None = None
            if llm_base_url and llm_api_key and llm_model:
                r.hset(f"task:{task_id}", mapping={"progress": "42"})
                print(f"[AutoEdit] Calling LLM for script generation...")
                try:
                    llm_script = _call_llm_for_script(
                        base_url=llm_base_url,
                        api_key=llm_api_key,
                        model=llm_model,
                        template=template,
                        clip_count=len(clips_scored),
                        duration_sec=duration_sec,
                        audio_bpm=tempo_bpm,
                    )
                    if llm_script:
                        print(f"[AutoEdit] LLM generated title: "
                              f"{llm_script.get('title', 'N/A')}")
                except Exception as exc:
                    print(f"[AutoEdit] LLM call failed (non-fatal): {exc}")

            r.hset(f"task:{task_id}", mapping={"progress": "45"})

            # ---------------------------------------------------------------- #
            # Stage 3: Ranking + beat-aligned clip selection                   #
            # ---------------------------------------------------------------- #
            print(f"[AutoEdit] Ranking {len(clips_scored)} clips "
                  f"(template={template})...")

            ranked = template_sort(clips_scored, template)

            segments = align_clips_to_beats(
                clips_scored=ranked,
                beat_times=beat_times,
                target_duration_sec=duration_sec,
            )
            print(f"[AutoEdit] Selected {len(segments)} segments "
                  f"for {duration_sec}s timeline")

            r.hset(f"task:{task_id}", mapping={"progress": "65"})

            # ---------------------------------------------------------------- #
            # Stage 4: Build draft JSON                                        #
            # ---------------------------------------------------------------- #
            r.hset(f"task:{task_id}", mapping={"progress": "70"})
            draft = build_draft(
                clips=segments,
                audio_path=audio_path,
                beat_times=beat_times,
                aspect_ratio=aspect_ratio,
                duration_sec=duration_sec,
                template=template,
                tempo_bpm=tempo_bpm,
            )

            # Embed LLM-generated script into draft meta (if available)
            if llm_script:
                draft["meta"]["llm_script"] = llm_script

            r.hset(f"task:{task_id}", mapping={"progress": "85"})

            # ---------------------------------------------------------------- #
            # Stage 5: Write to disk + update Redis                            #
            # ---------------------------------------------------------------- #
            draft_filename = f"{task_id}_draft.json"
            draft_path     = os.path.join(OUTPUT_DIR, draft_filename)

            with open(draft_path, "w", encoding="utf-8") as fh:
                json.dump(draft, fh, ensure_ascii=False, indent=2)

            result_url = f"/output/{draft_filename}"

            r.hset(f"task:{task_id}", mapping={
                "status":     "completed",
                "progress":   "100",
                "result_url": result_url,
            })

            print(f"[AutoEdit] Done → {result_url}")
            return {"url": result_url}

        except Exception:
            traceback.print_exc()
            raise

        finally:
            # Clean up any intermediate temp files (not the originals)
            for tp in temp_files:
                try:
                    if os.path.isfile(tp):
                        os.remove(tp)
                except OSError:
                    pass


# --------------------------------------------------------------------------- #
# Per-clip helpers                                                              #
# --------------------------------------------------------------------------- #

def _analyse_video(path: str) -> dict[str, Any]:
    """Return a clip descriptor dict from OpenCV analysis."""
    try:
        info = get_video_info(path)
        fps       = info.get("fps", 25)
        duration  = info.get("duration", 0.0)

        cap = cv2.VideoCapture(path)
        quality_scores: list[float] = []
        motion_values:  list[float] = []
        prev_gray: Any = None
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % SAMPLE_INTERVAL == 0:
                q = score_frame_quality(frame)
                if q["is_usable"]:
                    quality_scores.append(q["blur_score"])

                # Simple optical-flow motion estimate
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                if prev_gray is not None:
                    diff = cv2.absdiff(gray, prev_gray)
                    motion_values.append(float(diff.mean()))
                prev_gray = gray
            frame_idx += 1

        cap.release()

        avg_quality = (sum(quality_scores) / len(quality_scores)
                       if quality_scores else 0.3)
        avg_motion  = (sum(motion_values)  / len(motion_values)
                       if motion_values  else 0.0)

        # Normalise blur score (typical range 0–300) to 0–1
        norm_quality = min(avg_quality / 150.0, 1.0)

        motion_label = _motion_label(avg_motion)
        motion_score = {
            "low": 0.3, "medium": 0.6, "high": 1.0
        }[motion_label]

        composite_score = round(0.6 * norm_quality + 0.4 * motion_score, 3)

        # Shot-change times (scene boundaries)
        scene_times: list[float] = []
        try:
            scene_times = detect_shot_changes(path, sensitivity=0.4,
                                              sample_every=max(1, int(fps / 4)))
        except Exception:
            pass

        return {
            "path":        path,
            "duration":    duration,
            "score":       composite_score,
            "motion":      motion_label,
            "scene_times": scene_times,
        }

    except Exception as exc:
        print(f"[AutoEdit] Error analysing video {path}: {exc}")
        return {
            "path":        path,
            "duration":    5.0,
            "score":       0.3,
            "motion":      "medium",
            "scene_times": [],
        }


def _analyse_image(path: str) -> dict[str, Any]:
    """Return a clip descriptor for a static image (treated as 2-second clip)."""
    try:
        img = cv2.imread(path)
        quality: dict[str, Any] = {}
        if img is not None:
            quality = score_frame_quality(img)
        blur = quality.get("blur_score", 50.0)
        norm_quality = min(blur / 150.0, 1.0)
        return {
            "path":        path,
            "duration":    2.0,
            "score":       round(norm_quality, 3),
            "motion":      "low",
            "scene_times": [],
        }
    except Exception as exc:
        print(f"[AutoEdit] Error analysing image {path}: {exc}")
        return {
            "path":     path,
            "duration": 2.0,
            "score":    0.4,
            "motion":   "low",
            "scene_times": [],
        }


def _motion_label(mean_diff: float) -> str:
    if mean_diff >= MOTION_THRESHOLD_HIGH * 255:
        return "high"
    if mean_diff <= MOTION_THRESHOLD_LOW * 255:
        return "low"
    return "medium"


# --------------------------------------------------------------------------- #
# LLM helper                                                                    #
# --------------------------------------------------------------------------- #

def _call_llm_for_script(
    base_url: str,
    api_key: str,
    model: str,
    template: str = "vlog",
    clip_count: int = 0,
    duration_sec: float = 30.0,
    audio_bpm: float = 0.0,
) -> dict[str, Any] | None:
    """
    Call an OpenAI-compatible LLM to generate a script / title / caption
    for the auto-edit draft.  Returns a dict with keys:
      title, description, captions[], style_tips[]
    or None on failure.
    """
    if not _LLM_AVAILABLE:
        return None

    url = f"{base_url.rstrip('/')}/chat/completions"

    system_prompt = (
        "You are a professional short-video editor. "
        "Given the video metadata below, generate a JSON object with: "
        "title (string), description (string), "
        "captions (array of strings, one per clip segment), "
        "style_tips (array of 2-3 editing tips). "
        "Respond with ONLY the JSON object, no markdown."
    )

    user_prompt = (
        f"Template: {template}\n"
        f"Clip count: {clip_count}\n"
        f"Target duration: {duration_sec}s\n"
        f"Audio BPM: {audio_bpm or 'unknown'}\n"
    )

    body = _json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "max_tokens": 512,
        "temperature": 0.7,
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = _json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        # Strip possible markdown fences
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
        if content.endswith("```"):
            content = content.rsplit("```", 1)[0]
        return _json.loads(content)
    except Exception as exc:
        print(f"[AutoEdit] LLM call error: {exc}")
        return None
