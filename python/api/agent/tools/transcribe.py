"""
tools/transcribe.py — Transcribe tool wrapper for UniVA Agent.
"""
from __future__ import annotations


def build_payload(
    video_path: str,
    burn_subtitles: bool = False,
    language: str | None = None,
) -> dict:
    """
    Build payload for the 'transcribe' task (Whisper).

    Args:
        video_path      : Absolute path to the video file on disk.
        burn_subtitles  : If True, burn subtitle track into video. Default: False.
        language        : ISO 639-1 language code for forced decode. Default: auto.
    """
    payload: dict = {
        "videoPath": video_path,
        "burnSubtitles": burn_subtitles,
    }
    if language:
        payload["language"] = language
    return payload
