"""
TranscribeTask: uses Whisper medium to transcribe a video and generate subtitles.

Workflow:
  1. Extract 16kHz mono WAV from video (FFmpeg)
  2. Run Whisper medium transcription
  3. Write .srt subtitle file
  4. (Optional) Burn subtitles into video (FFmpeg subtitles filter)
"""
import os

import whisper

from utils.ffmpeg_helper import extract_audio, burn_subtitles


class TranscribeTask:
    """Singleton-model approach: load Whisper once and reuse across tasks."""

    _model = None

    def _get_model(self):
        if TranscribeTask._model is None:
            print("[Transcribe] Loading Whisper medium model (first run ~30s)...")
            TranscribeTask._model = whisper.load_model("medium")
            print("[Transcribe] Whisper medium model loaded.")
        return TranscribeTask._model

    def execute(self, task: dict, r) -> dict:
        payload = task.get("payload", {})
        task_id = task.get("taskId", "unknown")
        video_path = payload.get("videoPath")
        burn = payload.get("burnSubtitles", False)
        language = payload.get("language") or None  # None = Whisper auto-detect

        if not video_path or not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        output_dir = os.environ.get("OUTPUT_DIR", "/app/output")
        work_dir = os.path.join(output_dir, task_id)
        os.makedirs(work_dir, exist_ok=True)

        # Step 1 — Extract audio
        r.hset(f"task:{task_id}", mapping={"status": "transcribing", "progress": "20"})
        audio_path = os.path.join(work_dir, "audio.wav")
        print(f"[Transcribe] Extracting audio from: {video_path}")
        extract_audio(video_path, audio_path)

        # Step 2 — Whisper transcription
        r.hset(f"task:{task_id}", mapping={"progress": "50"})
        model = self._get_model()
        print(f"[Transcribe] Starting transcription (language={language or 'auto'})...")
        transcribe_opts: dict = {}
        if language:
            transcribe_opts["language"] = language
        result = model.transcribe(audio_path, **transcribe_opts)
        detected_language = result.get("language", "unknown")
        print(f"[Transcribe] Detected language: {detected_language}, segments: {len(result['segments'])}")

        # Step 3 — Write .srt
        r.hset(f"task:{task_id}", mapping={"progress": "80"})
        srt_path = os.path.join(work_dir, "subtitles.srt")
        _write_srt(result["segments"], srt_path)
        print(f"[Transcribe] SRT written: {srt_path}")

        srt_url = f"/output/{task_id}/subtitles.srt"
        result_url = srt_url

        # Step 4 — Optionally burn subtitles into video
        if burn:
            r.hset(f"task:{task_id}", mapping={"progress": "90"})
            burned_path = os.path.join(work_dir, "with_subtitles.mp4")
            print(f"[Transcribe] Burning subtitles into video...")
            burn_subtitles(video_path, srt_path, burned_path)
            result_url = f"/output/{task_id}/with_subtitles.mp4"
            print(f"[Transcribe] Burned video: {burned_path}")

        return {"url": result_url, "srt_url": srt_url}


# ---------------------------------------------------------------------------
# SRT helpers
# ---------------------------------------------------------------------------

def _fmt_time(seconds: float) -> str:
    """Convert float seconds to SRT timestamp: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _write_srt(segments: list, path: str):
    """Write Whisper segment list to an SRT file."""
    with open(path, "w", encoding="utf-8") as f:
        for i, seg in enumerate(segments, 1):
            f.write(f"{i}\n")
            f.write(f"{_fmt_time(seg['start'])} --> {_fmt_time(seg['end'])}\n")
            f.write(f"{seg['text'].strip()}\n\n")
