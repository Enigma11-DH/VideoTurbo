"""
FFmpeg Helper — Subprocess wrappers for common FFmpeg operations.
"""
import json
import os
import subprocess
import urllib.request


def download_file(url: str, dest: str):
    """Download a file from URL to local path."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                f.write(chunk)


def probe_duration(file_path: str) -> float:
    """Get duration of a media file in seconds using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                file_path,
            ],
            capture_output=True,
            text=True,
        )
        data = json.loads(result.stdout)
        return float(data.get("format", {}).get("duration", 0))
    except Exception as e:
        print(f"[FFmpeg] probe_duration error: {e}")
        return 0.0


def combine_video_audio(video_path: str, audio_path: str, output_path: str):
    """Combine a video file with an audio file (replace audio track)."""
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-c:a", "aac",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-shortest",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[FFmpeg] combine error: {result.stderr[:500]}")
        raise RuntimeError(f"FFmpeg combine failed: {result.stderr[:200]}")


def concat_videos(input_files: list[str], output_path: str, work_dir: str):
    """Concatenate multiple video files using FFmpeg concat demuxer."""
    # Write concat list file
    list_path = os.path.join(work_dir, "concat_list.txt")
    with open(list_path, "w") as f:
        for fp in input_files:
            # Escape single quotes in path
            safe_path = fp.replace("'", "'\\''")
            f.write(f"file '{safe_path}'\n")

    cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", list_path,
        "-c", "copy",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # Fallback: re-encode if stream copy fails
        print(f"[FFmpeg] concat copy failed, trying re-encode: {result.stderr[:200]}")
        cmd_reencode = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path,
            "-c:v", "libx264",
            "-c:a", "aac",
            "-preset", "fast",
            output_path,
        ]
        result2 = subprocess.run(cmd_reencode, capture_output=True, text=True)
        if result2.returncode != 0:
            raise RuntimeError(f"FFmpeg concat failed: {result2.stderr[:200]}")


def trim_video(input_path: str, output_path: str, start: float, duration: float):
    """Trim a video from start time for given duration."""
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start),
        "-i", input_path,
        "-t", str(duration),
        "-c", "copy",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg trim failed: {result.stderr[:200]}")


def extract_audio(video_path: str, output_path: str):
    """Extract audio track from video as 16kHz mono WAV (Whisper optimal format)."""
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-ar", "16000",
        "-ac", "1",
        "-vn",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg extract_audio failed: {result.stderr[:200]}")


def burn_subtitles(video_path: str, srt_path: str, output_path: str):
    """Burn .srt subtitles into video using FFmpeg subtitles filter."""
    # Normalize path separators and escape colons for FFmpeg filter syntax
    safe_srt = srt_path.replace("\\", "/").replace(":", "\\:")
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vf", (
            f"subtitles={safe_srt}:force_style="
            "'FontSize=18,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H00000000,Outline=2'"
        ),
        "-c:a", "copy",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg burn_subtitles failed: {result.stderr[:200]}")
