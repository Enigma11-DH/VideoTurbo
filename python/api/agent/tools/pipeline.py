"""
tools/pipeline.py — Pipeline tool wrapper for UniVA Agent.
"""
from __future__ import annotations


def build_payload(
    topic: str,
    style: str | None = None,
    duration: int | None = None,
    language: str = "zh",
) -> dict:
    """
    Build payload for the 'pipeline' task (end-to-end video generation).

    Args:
        topic    : Video topic or title, e.g. "春节旅行 Vlog".
        style    : Visual style hint: "vlog" | "product" | "educational" | None.
        duration : Target video duration in seconds. None = model default.
        language : Script language code. Default: "zh".
    """
    payload: dict = {"topic": topic, "language": language}
    if style:
        payload["style"] = style
    if duration is not None:
        payload["duration"] = duration
    return payload
