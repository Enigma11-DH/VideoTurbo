"""
registry.py — Tool Registry for UniVA Agent.

Each registered tool maps a logical tool name to:
  - A human-readable description
  - The task_type key used in worker.py handlers
  - Required and optional payload keys

New tools can be registered at runtime via ToolRegistry.register().
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TaskTool:
    """Descriptor for a single agent-callable tool."""
    name: str
    description: str
    task_type: str                      # must match a key in worker.py handlers dict
    required_payload_keys: list[str]
    optional_payload_keys: list[str] = field(default_factory=list)

    def validate_payload(self, payload: dict) -> list[str]:
        """
        Return a list of missing required keys.
        Empty list means the payload is valid.
        """
        return [k for k in self.required_payload_keys if k not in payload]

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "task_type": self.task_type,
            "required_payload_keys": self.required_payload_keys,
            "optional_payload_keys": self.optional_payload_keys,
        }


class ToolRegistry:
    """
    Central registry of all tools the agent can invoke.

    Usage:
        registry = ToolRegistry()
        tool = registry.get("beat_analyze")
        missing = tool.validate_payload({"audioPath": "/tmp/x.mp3"})
    """

    def __init__(self):
        self._tools: dict[str, TaskTool] = {}
        self._register_defaults()

    # ------------------------------------------------------------------
    # Default tool set (mirrors worker.py handlers)
    # ------------------------------------------------------------------

    def _register_defaults(self):
        defaults = [
            TaskTool(
                name="render",
                description="使用 FFmpeg 渲染/生成最终视频",
                task_type="render",
                required_payload_keys=["scriptPath"],
                optional_payload_keys=["outputFormat", "resolution"],
            ),
            TaskTool(
                name="analyze",
                description="AI 内容分析（场景识别、标签生成）",
                task_type="analyze",
                required_payload_keys=["videoPath"],
            ),
            TaskTool(
                name="video_analyze",
                description="OpenCV 视频智能分析：质量评分、镜头切换、人脸检测、黑边、色调、重复帧",
                task_type="video_analyze",
                required_payload_keys=["videoPath"],
                optional_payload_keys=["sampleInterval"],
            ),
            TaskTool(
                name="beat_analyze",
                description="librosa 节拍分析：提取 BPM、强拍、段落、切点时间表",
                task_type="beat_analyze",
                required_payload_keys=["audioPath"],
                optional_payload_keys=["everyNBeats"],
            ),
            TaskTool(
                name="transcribe",
                description="Whisper 语音转录：生成 .srt 字幕，可选烧录进视频",
                task_type="transcribe",
                required_payload_keys=["videoPath"],
                optional_payload_keys=["burnSubtitles", "language"],
            ),
            TaskTool(
                name="crawl",
                description="爬取/下载平台视频素材（抖音、Bilibili、YouTube 等）",
                task_type="crawl",
                required_payload_keys=["url"],
                optional_payload_keys=["platform", "quality"],
            ),
            TaskTool(
                name="pipeline",
                description="端到端视频生成流水线：分镜脚本 → 素材 → 合成成品",
                task_type="pipeline",
                required_payload_keys=["topic"],
                optional_payload_keys=["style", "duration", "language"],
            ),
        ]
        for tool in defaults:
            self._tools[tool.name] = tool

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register(self, tool: TaskTool) -> None:
        """Register or replace a tool at runtime."""
        self._tools[tool.name] = tool

    def get(self, name: str) -> TaskTool | None:
        """Return a tool by name, or None if not found."""
        return self._tools.get(name)

    def get_or_raise(self, name: str) -> TaskTool:
        """Return a tool by name, raise ValueError if not found."""
        tool = self._tools.get(name)
        if tool is None:
            available = ", ".join(self._tools.keys())
            raise ValueError(f"Unknown tool '{name}'. Available: {available}")
        return tool

    def list_tools(self) -> list[dict]:
        """Return all registered tools as a list of dicts."""
        return [t.to_dict() for t in self._tools.values()]

    def all_names(self) -> list[str]:
        return list(self._tools.keys())
