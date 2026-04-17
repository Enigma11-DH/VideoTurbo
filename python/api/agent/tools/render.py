"""
tools/render.py — Render tool wrapper for UniVA Agent.

Wraps the VideoRenderTask payload contract so the agent can invoke it
with high-level parameters.
"""
from __future__ import annotations


def build_payload(
    script_path: str,
    output_format: str = "mp4",
    resolution: str = "1080p",
) -> dict:
    """
    Build a validated payload dict for the 'render' task type.

    Args:
        script_path   : Path to the render script / storyboard JSON on disk.
        output_format : Output container format. Default: "mp4".
        resolution    : Target resolution string. Default: "1080p".

    Returns:
        payload dict ready for ExecutorAgent.execute_plan()
    """
    return {
        "scriptPath": script_path,
        "outputFormat": output_format,
        "resolution": resolution,
    }
