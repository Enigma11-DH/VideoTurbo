"""
tools/analyze.py — Analyze tool wrappers for UniVA Agent.

Wraps video_analyze (OpenCV) and beat_analyze (librosa) payload contracts.
"""
from __future__ import annotations


def build_video_analyze_payload(
    video_path: str,
    sample_interval: int = 15,
) -> dict:
    """
    Build payload for the 'video_analyze' task.

    Args:
        video_path      : Absolute path to the video file on disk.
        sample_interval : Frame sampling interval (higher = faster). Default: 15.
    """
    return {
        "videoPath": video_path,
        "sampleInterval": sample_interval,
    }


def build_beat_analyze_payload(
    audio_path: str,
    every_n_beats: int = 2,
) -> dict:
    """
    Build payload for the 'beat_analyze' task.

    Args:
        audio_path    : Absolute path to the audio file on disk.
        every_n_beats : Sample one cut point every N beats. Default: 2.
    """
    return {
        "audioPath": audio_path,
        "everyNBeats": every_n_beats,
    }
