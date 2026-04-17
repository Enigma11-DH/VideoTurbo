"""
BeatAnalyzeTask — Analyse a BGM audio file with librosa and produce a
beat / rhythm JSON report for use in beat-synced video editing.

Progress stages:
  20% — Load audio
  50% — Beat tracking + onset detection
  70% — Section analysis
  85% — Compute cut points + strong beats
  95% — Write JSON report
 100% — Done
"""
import json
import os

from utils.audio_helper import (
    load_audio,
    analyze_beats,
    analyze_onsets,
    get_strong_beats,
    analyze_sections,
    compute_cut_points,
)


class BeatAnalyzeTask:
    """Analyse a BGM audio file and output a structured beat-sync JSON report."""

    def execute(self, task: dict, r) -> dict:
        payload = task.get("payload", {})
        task_id = task.get("taskId", "unknown")
        audio_path = payload.get("audioPath")
        every_n_beats = int(payload.get("everyNBeats", 2))

        if not audio_path or not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        output_dir = os.environ.get("OUTPUT_DIR", "/app/output")
        work_dir = os.path.join(output_dir, task_id)
        os.makedirs(work_dir, exist_ok=True)

        # ------------------------------------------------------------------ #
        # Stage 1: Load audio                                                 #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"status": "beat_analyzing", "progress": "20"})
        print(f"[BeatAnalyze] Loading audio: {audio_path}")
        y, sr = load_audio(audio_path)
        duration = round(len(y) / sr, 3)
        print(f"[BeatAnalyze] Duration: {duration}s  SR: {sr}Hz")

        # ------------------------------------------------------------------ #
        # Stage 2: Beat tracking + onset detection                            #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "50"})
        print("[BeatAnalyze] Running beat tracking...")
        beat_result = analyze_beats(y, sr)
        tempo = beat_result["tempo"]
        beat_times = beat_result["beat_times"]
        avg_beat_interval = beat_result["avg_beat_interval"]
        print(f"[BeatAnalyze] Tempo: {tempo} BPM  Beats: {len(beat_times)}")

        print("[BeatAnalyze] Running onset detection...")
        onset_times = analyze_onsets(y, sr)
        print(f"[BeatAnalyze] Onsets detected: {len(onset_times)}")

        # ------------------------------------------------------------------ #
        # Stage 3: Section analysis                                           #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "70"})
        print("[BeatAnalyze] Analysing sections...")
        # Use fewer segments for short tracks
        n_segs = 8 if duration >= 60 else max(4, int(duration / 8))
        sections = analyze_sections(y, sr, n_segments=n_segs)
        print(f"[BeatAnalyze] Sections: {len(sections)}")

        # ------------------------------------------------------------------ #
        # Stage 4: Strong beats + cut points                                  #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "85"})
        strong_beats = get_strong_beats(beat_times, onset_times, tolerance=0.06)
        cut_points = compute_cut_points(beat_times, every_n_beats)
        print(f"[BeatAnalyze] Strong beats: {len(strong_beats)}  "
              f"Cut points (every {every_n_beats} beats): {len(cut_points)}")

        # ------------------------------------------------------------------ #
        # Stage 5: Write JSON report                                          #
        # ------------------------------------------------------------------ #
        r.hset(f"task:{task_id}", mapping={"progress": "95"})
        report = {
            "tempo": tempo,
            "duration": duration,
            "beat_times": beat_times,
            "strong_beats": strong_beats,
            "onset_times": onset_times,
            "sections": sections,
            "cut_points": cut_points,
            "avg_beat_interval": avg_beat_interval,
            "total_beats": len(beat_times),
            "every_n_beats": every_n_beats,
        }

        report_path = os.path.join(work_dir, "beat_analysis.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        r.hset(f"task:{task_id}", "result_json", json.dumps(report, ensure_ascii=False))

        result_url = f"/output/{task_id}/beat_analysis.json"
        print(f"[BeatAnalyze] Done. BPM={tempo}  cuts={len(cut_points)}")

        return {"url": result_url}
