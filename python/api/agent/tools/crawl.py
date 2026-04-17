"""
tools/crawl.py — Crawl tool wrapper for UniVA Agent.
"""
from __future__ import annotations


def build_payload(
    url: str,
    platform: str | None = None,
    quality: str = "best",
) -> dict:
    """
    Build payload for the 'crawl' task (platform crawler).

    Args:
        url      : Video URL (Douyin, Bilibili, YouTube, etc.)
        platform : Explicit platform hint: "douyin" | "bilibili" | "youtube" | None.
        quality  : Download quality selector. Default: "best".
    """
    payload: dict = {"url": url, "quality": quality}
    if platform:
        payload["platform"] = platform
    return payload
