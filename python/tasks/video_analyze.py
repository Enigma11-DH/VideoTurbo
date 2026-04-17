"""
VideoAnalyzeTask — Comprehensive OpenCV-based video analysis.

Pipeline:
  10% — Read video metadata
  30% — Frame quality scan (blur / brightness / black screen)
  60% — Shot change detection
  75% — Face detection on best frames
  85% — Black border + color tone analysis
  90% — Duplicate frame detection (perceptual hash)
  95% — Thumbnail extraction + JSON report
 100% — Done
"""
import json
import os

import cv2

from utils.cv_helper import (
    get_video_info,
    score_frame_quality,
    quality_fail_reason,
    detect_shot_changes,
    load_face_cascade,
    detect_faces,
    suggest_9_16_crop,
    detect_black_borders,
    borders_to_crop,
    analyze_color_tone,
    compute_frame_hash,
    hash_distance,
    extract_thumbnail,
)

# Duplicate threshold: frames with hash distance <= this are considered similar
DUPLICATE_HASH_THRESHOLD = 8


class VideoAnalyzeTask:
    """Analyse a video file and produce a structured JSON report."""

    def execute(self, task: dict, r) -> dict:
        payload = task.get("payload", {})
        task_id = task.get("taskId", "unknown")
        video_path = payload.get("videoPath")
        sample_interval = int(payload.get("sampleInterval", 15))

        if not video_path or not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")

        output_dir = os.environ.get("OUTPUT_DIR", "/app/output")
        work_dir = os.path.join(output_dir, task_id)
        os.makedirs(work_dir, exist_ok=True)

        # ------------------------------------------------------------------ #
        # Stage 1: Video metadata                                             #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"status": "video_analyzing", "progress": "10"})
        print(f"[Analyze] Reading metadata: {video_path}")
        info = get_video_info(video_path)
        fps = info["fps"]
        total_frames = info["total_frames"]
        frame_w, frame_h = info["resolution"]

        # ------------------------------------------------------------------ #
        # Stage 2: Frame quality scan                                         #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "20"})
        print(f"[Analyze] Quality scan (sample_interval={sample_interval})...")

        cap = cv2.VideoCapture(video_path)
        quality_map: dict[int, dict] = {}   # frame_idx -> quality result
        best_frame = None
        best_blur = -1.0

        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % sample_interval == 0:
                q = score_frame_quality(frame)
                quality_map[frame_idx] = q
                # Track the sharpest, well-exposed frame for later analysis
                if q["is_usable"] and q["blur_score"] > best_blur:
                    best_blur = q["blur_score"]
                    best_frame = frame.copy()
            frame_idx += 1

        cap.release()
        r.hset(f"task:{task_id}", mapping={"progress": "30"})

        # Aggregate quality into usable/bad segments
        usable_segments, bad_segments = _aggregate_segments(
            quality_map, sample_interval, fps, total_frames
        )
        usable_frame_count = sum(1 for q in quality_map.values() if q["is_usable"])
        total_sampled = len(quality_map) or 1
        quality_score = round(usable_frame_count / total_sampled, 3)

        # Average blur of usable frames
        usable_blurs = [q["blur_score"] for q in quality_map.values() if q["is_usable"]]
        avg_blur = round(sum(usable_blurs) / len(usable_blurs), 2) if usable_blurs else 0.0

        # ------------------------------------------------------------------ #
        # Stage 3: Shot change detection                                      #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "60"})
        print("[Analyze] Detecting shot changes...")
        cut_points = detect_shot_changes(
            video_path,
            sensitivity=0.4,
            sample_every=sample_every(fps),
        )

        # ------------------------------------------------------------------ #
        # Stage 4: Face detection                                             #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "75"})
        face_detected = False
        face_ratio = 0.0
        suggested_crop_9_16 = suggest_9_16_crop(frame_w, frame_h, [])

        if best_frame is not None:
            print("[Analyze] Running face detection...")
            try:
                cascade = load_face_cascade()
                faces = detect_faces(best_frame, cascade)
                if faces:
                    face_detected = True
                    largest = max(faces, key=lambda f: f["w"] * f["h"])
                    face_ratio = round(
                        (largest["w"] * largest["h"]) / (frame_w * frame_h), 4
                    )
                    suggested_crop_9_16 = suggest_9_16_crop(frame_w, frame_h, faces)
            except Exception as e:
                print(f"[Analyze] Face detection skipped: {e}")

        # ------------------------------------------------------------------ #
        # Stage 5: Black border + color tone                                  #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "85"})
        black_borders = {"top": 0, "bottom": 0, "left": 0, "right": 0}
        suggested_clean_crop = {"x": 0, "y": 0, "w": frame_w, "h": frame_h}
        color_tone = "neutral"

        if best_frame is not None:
            print("[Analyze] Detecting black borders + color tone...")
            black_borders = detect_black_borders(best_frame)
            suggested_clean_crop = borders_to_crop(black_borders, frame_w, frame_h)
            color_tone = analyze_color_tone(best_frame)

        # ------------------------------------------------------------------ #
        # Stage 6: Duplicate frame detection                                  #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "90"})
        print("[Analyze] Computing perceptual hashes for duplicate detection...")
        duplicate_count = 0

        # Compute hashes for all sampled frames
        cap2 = cv2.VideoCapture(video_path)
        hashes: list[str] = []
        fi = 0
        while True:
            ret, frame = cap2.read()
            if not ret:
                break
            if fi % (sample_interval * 2) == 0:  # sparser sampling for speed
                hashes.append(compute_frame_hash(frame))
            fi += 1
        cap2.release()

        # Count near-duplicate pairs
        seen_pairs: set[tuple] = set()
        for i in range(len(hashes)):
            for j in range(i + 1, min(i + 5, len(hashes))):  # compare with next 5
                d = hash_distance(hashes[i], hashes[j])
                if d <= DUPLICATE_HASH_THRESHOLD:
                    pair = (min(i, j), max(i, j))
                    if pair not in seen_pairs:
                        seen_pairs.add(pair)
                        duplicate_count += 1

        # ------------------------------------------------------------------ #
        # Stage 7: Thumbnail + report                                         #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "95"})
        thumb_url = ""
        if best_frame is not None:
            thumb_path = os.path.join(work_dir, "thumb.jpg")
            extract_thumbnail(best_frame, thumb_path)
            thumb_url = f"/output/{task_id}/thumb.jpg"

        report = {
            "duration": info["duration"],
            "resolution": info["resolution"],
            "fps": info["fps"],
            "aspect_ratio": info["aspect_ratio"],
            "quality_score": quality_score,
            "avg_blur_score": avg_blur,
            "usable_segments": usable_segments,
            "bad_segments": bad_segments,
            "cut_points": cut_points,
            "face_detected": face_detected,
            "face_ratio": face_ratio,
            "suggested_crop_9_16": suggested_crop_9_16,
            "black_borders": black_borders,
            "suggested_clean_crop": suggested_clean_crop,
            "duplicate_count": duplicate_count,
            "color_tone": color_tone,
            "thumbnail_url": thumb_url,
        }

        # Write JSON report to disk and Redis
        report_path = os.path.join(work_dir, "analysis.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        r.hset(f"task:{task_id}", "result_json", json.dumps(report, ensure_ascii=False))

        result_url = f"/output/{task_id}/analysis.json"
        print(f"[Analyze] Done. quality={quality_score}, cuts={len(cut_points)}, "
              f"faces={face_detected}, color={color_tone}")

        return {"url": result_url}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def sample_every(fps: float) -> int:
    """Return a sensible frame interval for shot detection based on FPS."""
    if fps <= 0:
        return 5
    # ~4 samples per second
    return max(1, int(fps / 4))


def _aggregate_segments(
    quality_map: dict,
    sample_interval: int,
    fps: float,
    total_frames: int,
) -> tuple[list, list]:
    """
    Convert per-frame quality results into time segments.

    Consecutive usable frames → usable_segments
    Consecutive bad frames    → bad_segments (with reason)
    """
    if not quality_map or fps <= 0:
        return [], []

    sorted_indices = sorted(quality_map.keys())

    usable_segments: list[dict] = []
    bad_segments: list[dict] = []

    seg_start_idx = sorted_indices[0]
    seg_usable = quality_map[seg_start_idx]["is_usable"]
    seg_reason = quality_fail_reason(quality_map[seg_start_idx]) if not seg_usable else ""

    def _ts(idx: int) -> float:
        return round(idx / fps, 2)

    for i in range(1, len(sorted_indices)):
        cur_idx = sorted_indices[i]
        cur_usable = quality_map[cur_idx]["is_usable"]
        cur_reason = quality_fail_reason(quality_map[cur_idx]) if not cur_usable else ""

        transition = cur_usable != seg_usable or cur_reason != seg_reason

        if transition:
            end_ts = _ts(min(cur_idx, total_frames - 1))
            start_ts = _ts(seg_start_idx)
            if end_ts > start_ts:
                entry = {"start": start_ts, "end": end_ts}
                if seg_usable:
                    usable_segments.append(entry)
                else:
                    bad_segments.append({**entry, "reason": seg_reason})

            seg_start_idx = cur_idx
            seg_usable = cur_usable
            seg_reason = cur_reason

    # Close last segment
    end_ts = _ts(total_frames - 1)
    start_ts = _ts(seg_start_idx)
    if end_ts > start_ts:
        entry = {"start": start_ts, "end": end_ts}
        if seg_usable:
            usable_segments.append(entry)
        else:
            bad_segments.append({**entry, "reason": seg_reason})

    return usable_segments, bad_segments
