"""
draft_builder.py
~~~~~~~~~~~~~~~~
Build a standardised multi-track JSON draft that maps to the clips, audio and
beat markers produced by the auto-edit pipeline.

Output schema (version 1.0)
----------------------------
{
  "version": "1.0",
  "canvas": {
    "width": <int>,          // e.g. 1080
    "height": <int>,         // e.g. 1920
    "fps": <int>             // default 30
  },
  "duration_ms": <int>,      // total timeline duration in milliseconds
  "tracks": {
    "video": [
      {
        "id": "clip_001",
        "src": "/output/uploads/xxx.mp4",
        "in_ms": 0,            // position on timeline (start)
        "out_ms": 2000,        // position on timeline (end)
        "clip_in_ms": 0,       // offset into source file (start)
        "clip_out_ms": 2000,   // offset into source file (end)
        "score": 0.87,         // composite quality score
        "motion": "medium"     // "low" | "medium" | "high"
      }
    ],
    "audio": [
      {
        "id": "bgm_001",
        "src": "/output/uploads/yyy.mp3",
        "in_ms": 0,
        "out_ms": 30000
      }
    ],
    "text": []
  },
  "beat_markers_ms": [0, 500, 1000, ...],
  "meta": {
    "template": "vlog",
    "tempo_bpm": 128.0,
    "aspect_ratio": "9:16",
    "target_duration_sec": 30
  }
}
"""
from __future__ import annotations

import math
import uuid
from typing import Any

# --------------------------------------------------------------------------- #
# Canvas configuration                                                         #
# --------------------------------------------------------------------------- #

_CANVAS_PRESETS: dict[str, dict[str, int]] = {
    "16:9": {"width": 1920, "height": 1080},
    "9:16": {"width": 1080, "height": 1920},
    "1:1":  {"width": 1080, "height": 1080},
    "4:3":  {"width": 1440, "height": 1080},
}

_DEFAULT_FPS = 30


def _canvas_for(aspect_ratio: str) -> dict[str, int]:
    preset = _CANVAS_PRESETS.get(aspect_ratio, _CANVAS_PRESETS["9:16"])
    return {**preset, "fps": _DEFAULT_FPS}


# --------------------------------------------------------------------------- #
# Template-aware scoring                                                        #
# --------------------------------------------------------------------------- #

_TEMPLATE_MOTION_PREF: dict[str, str] = {
    # Vlog, sports, travel → prefer dynamic shots
    "vlog":      "high",
    "sports":    "high",
    "travel":    "medium",
    # Product, knowledge, food → prefer static/clean shots
    "product":   "low",
    "knowledge": "low",
    "food":      "low",
}

_MOTION_SCORE: dict[str, float] = {"low": 0.3, "medium": 0.6, "high": 1.0}


def _template_bonus(clip: dict[str, Any], template: str) -> float:
    """Return a small template-affinity bonus (0–0.3) for sorting."""
    preferred = _TEMPLATE_MOTION_PREF.get(template, "medium")
    clip_motion = clip.get("motion", "medium")
    if clip_motion == preferred:
        return 0.3
    if abs(["low", "medium", "high"].index(clip_motion) -
           ["low", "medium", "high"].index(preferred)) == 1:
        return 0.1
    return 0.0


def template_sort(clips: list[dict[str, Any]], template: str) -> list[dict[str, Any]]:
    """Re-rank clips by template affinity + raw quality score (descending)."""
    def key(c: dict[str, Any]) -> float:
        return c.get("score", 0.5) + _template_bonus(c, template)

    return sorted(clips, key=key, reverse=True)


# --------------------------------------------------------------------------- #
# Beat-aligned clip selection                                                   #
# --------------------------------------------------------------------------- #

def align_clips_to_beats(
    clips_scored: list[dict[str, Any]],
    beat_times: list[float],
    target_duration_sec: float,
    min_clip_sec: float = 1.0,
) -> list[dict[str, Any]]:
    """
    Cut clips at beat boundaries and assemble a sequence that
    fills *target_duration_sec* (approximately).

    Parameters
    ----------
    clips_scored : list of clip dicts, each must have:
        - "path"       : str  — absolute path to video/image file
        - "duration"   : float — source duration in seconds
        - "score"      : float — quality score 0–1
        - "motion"     : str  — "low" | "medium" | "high"
        - "scene_times": list[float] — scene-change times within the clip (sec)
    beat_times   : sorted list of beat timestamps in seconds
    target_duration_sec : total desired timeline length
    min_clip_sec : minimum cut length (avoid sub-second fragments)

    Returns
    -------
    list of segment dicts compatible with build_draft()
    """
    if not clips_scored:
        return []

    if not beat_times:
        # No audio — split clips evenly by default 2-second cuts
        beat_times = list(range(0, math.ceil(target_duration_sec) + 2, 2))

    # Build a flat list of "windows" between consecutive beats
    windows: list[float] = []
    for i in range(len(beat_times) - 1):
        w = beat_times[i + 1] - beat_times[i]
        if w >= min_clip_sec:
            windows.append(w)

    if not windows:
        windows = [2.0] * int(target_duration_sec // 2)

    # Determine how many windows we need
    total_needed = 0.0
    needed_windows: list[float] = []
    for w in windows:
        if total_needed >= target_duration_sec:
            break
        needed_windows.append(w)
        total_needed += w

    # Round-robin through clips (highest score first), slicing each window
    pool = clips_scored[:]
    pool_idx = 0
    segments: list[dict[str, Any]] = []
    clip_offsets: dict[str, float] = {}  # track consumed offset per clip path

    for win in needed_windows:
        clip = pool[pool_idx % len(pool)]
        pool_idx += 1
        src = clip.get("path", "")
        clip_dur = clip.get("duration", 10.0)
        offset = clip_offsets.get(src, 0.0)

        # If remaining clip < window, try next clip
        if clip_dur - offset < win:
            offset = 0.0  # rewind if exhausted

        segments.append({
            "src":        src,
            "score":      round(clip.get("score", 0.5), 3),
            "motion":     clip.get("motion", "medium"),
            "clip_in_s":  round(offset, 3),
            "clip_out_s": round(offset + win, 3),
            "duration_s": round(win, 3),
        })
        clip_offsets[src] = offset + win

    return segments


# --------------------------------------------------------------------------- #
# Main builder                                                                  #
# --------------------------------------------------------------------------- #

def build_draft(
    clips: list[dict[str, Any]],
    audio_path: str | None,
    beat_times: list[float],
    aspect_ratio: str = "9:16",
    duration_sec: float = 30.0,
    template: str = "vlog",
    tempo_bpm: float = 0.0,
) -> dict[str, Any]:
    """
    Assemble the final track JSON from clip segments and audio.

    Parameters
    ----------
    clips        : output of align_clips_to_beats() (segment dicts)
    audio_path   : absolute path to BGM file, or None
    beat_times   : beat timestamps in seconds (for beat_markers_ms)
    aspect_ratio : one of "16:9" | "9:16" | "1:1" | "4:3"
    duration_sec : target total duration
    template     : template name for metadata
    tempo_bpm    : detected BPM (0 = unknown)

    Returns
    -------
    dict — the full JSON-serialisable draft object
    """
    canvas = _canvas_for(aspect_ratio)

    # ---- Video track ----
    video_track: list[dict[str, Any]] = []
    cursor_ms = 0
    for i, seg in enumerate(clips):
        clip_in_ms  = round(seg["clip_in_s"]  * 1000)
        clip_out_ms = round(seg["clip_out_s"] * 1000)
        dur_ms      = round(seg["duration_s"] * 1000)

        video_track.append({
            "id":          f"clip_{i + 1:03d}",
            "src":         seg["src"],
            "in_ms":       cursor_ms,
            "out_ms":      cursor_ms + dur_ms,
            "clip_in_ms":  clip_in_ms,
            "clip_out_ms": clip_out_ms,
            "score":       seg["score"],
            "motion":      seg["motion"],
        })
        cursor_ms += dur_ms

    total_ms = cursor_ms if cursor_ms > 0 else round(duration_sec * 1000)

    # ---- Audio track ----
    audio_track: list[dict[str, Any]] = []
    if audio_path:
        audio_track.append({
            "id":     "bgm_001",
            "src":    audio_path,
            "in_ms":  0,
            "out_ms": total_ms,
        })

    # ---- Beat markers ----
    beat_markers_ms = [round(t * 1000) for t in beat_times
                       if t * 1000 <= total_ms + 500]

    return {
        "version":        "1.0",
        "canvas":         canvas,
        "duration_ms":    total_ms,
        "tracks": {
            "video": video_track,
            "audio": audio_track,
            "text":  [],
        },
        "beat_markers_ms": beat_markers_ms,
        "meta": {
            "template":           template,
            "tempo_bpm":          round(tempo_bpm, 2),
            "aspect_ratio":       aspect_ratio,
            "target_duration_sec": duration_sec,
        },
    }
