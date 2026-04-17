"""
planner.py — Rule-based Planner Agent for UniVA.

The Planner translates a free-text `goal` and a `context` dict into an
ordered list of tool-invocation steps WITHOUT requiring an LLM.

Matching algorithm:
  1. Normalize goal to lowercase.
  2. Iterate through RULES in order (highest-priority first).
  3. First rule whose keyword set has ANY overlap with the goal tokens wins.
  4. Resolve each step's payload_template against `context`.
  5. Return the resolved step list.

If no rule matches, a "pipeline" fallback step is returned so that the
system always produces something actionable.
"""
from __future__ import annotations

import re
from typing import Any

from api.agent.registry import ToolRegistry


# ---------------------------------------------------------------------------
# Rule definitions
# ---------------------------------------------------------------------------

# Each rule: (keyword_list, step_template_list)
# Keywords are matched case-insensitively against the goal string.
# step_template payload values like "{videoPath}" are resolved from context.
# More specific rules should appear BEFORE more general ones.

_RULES: list[tuple[list[str], list[dict]]] = [
    # --- Compound rules (checked first) ---
    (
        ["分析并生成", "智能剪辑", "auto edit", "smart edit"],
        [
            {"tool": "video_analyze", "payload_template": {"videoPath": "{videoPath}", "sampleInterval": "{sampleInterval:15}"}},
            {"tool": "render",        "payload_template": {"scriptPath": "{scriptPath}"}},
        ],
    ),
    (
        ["转录并烧录", "字幕并烧录", "硬字幕"],
        [
            {"tool": "transcribe", "payload_template": {"videoPath": "{videoPath}", "burnSubtitles": "true"}},
        ],
    ),
    (
        ["下载并分析", "爬取并分析"],
        [
            {"tool": "crawl",         "payload_template": {"url": "{url}"}},
            {"tool": "video_analyze", "payload_template": {"videoPath": "{videoPath}"}},
        ],
    ),

    # --- Single-action rules ---
    (
        ["字幕", "subtitle", "srt", "转录", "transcribe", "语音识别"],
        [{"tool": "transcribe", "payload_template": {"videoPath": "{videoPath}"}}],
    ),
    (
        ["节拍", "卡点", "bgm", "beat", "bpm", "节奏"],
        [{"tool": "beat_analyze", "payload_template": {"audioPath": "{audioPath}"}}],
    ),
    (
        ["视频分析", "analyze video", "opencvanalyz", "镜头分析", "质量分析", "画面质量", "镜头切换", "人脸"],
        [{"tool": "video_analyze", "payload_template": {"videoPath": "{videoPath}"}}],
    ),
    (
        ["分析", "analyze", "质量", "镜头"],
        [{"tool": "video_analyze", "payload_template": {"videoPath": "{videoPath}"}}],
    ),
    (
        ["爬取", "下载", "抖音", "bilibili", "哔哩", "youtube", "crawl", "download"],
        [{"tool": "crawl", "payload_template": {"url": "{url}"}}],
    ),
    (
        ["生成视频", "pipeline", "端到端", "自动生成", "一键生成"],
        [{"tool": "pipeline", "payload_template": {"topic": "{topic}"}}],
    ),
    (
        ["渲染", "render", "合成", "拼接"],
        [{"tool": "render", "payload_template": {"scriptPath": "{scriptPath}"}}],
    ),
]

# Fallback when no rule matches
_FALLBACK_RULE: list[dict] = [
    {"tool": "pipeline", "payload_template": {"topic": "{goal}"}},
]


# ---------------------------------------------------------------------------
# Planner
# ---------------------------------------------------------------------------

class PlannerAgent:
    """
    Rule-based task planner.

    Maps a free-text `goal` + `context` dict to an ordered list of
    resolved tool-invocation steps.
    """

    def __init__(self, registry: ToolRegistry):
        self._registry = registry

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def plan(self, goal: str, context: dict) -> list[dict]:
        """
        Produce an execution plan for the given goal.

        Returns a list of steps:
            [
                {"tool": "beat_analyze", "payload": {"audioPath": "/tmp/x.mp3"}},
                ...
            ]

        Each step's payload is fully resolved (no template placeholders remain).
        """
        tokens = self._tokenize(goal)
        step_templates = self._match_rules(tokens, goal)
        steps = [self._resolve_step(tpl, goal, context) for tpl in step_templates]
        return steps

    def describe_plan(self, plan: list[dict]) -> str:
        """Return a human-readable description of a plan."""
        if not plan:
            return "无可执行步骤"
        lines = []
        for i, step in enumerate(plan, 1):
            tool_obj = self._registry.get(step["tool"])
            desc = tool_obj.description if tool_obj else step["tool"]
            lines.append(f"{i}. [{step['tool']}] {desc}")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _tokenize(goal: str) -> list[str]:
        """Lowercase + split goal into word tokens."""
        return re.split(r"[\s,，。！？、/]+", goal.lower())

    @staticmethod
    def _match_rules(tokens: list[str], goal: str) -> list[dict]:
        """
        Find the first matching rule by checking if ANY rule keyword
        appears in the goal string (case-insensitive substring match).
        """
        goal_lower = goal.lower()
        for keywords, step_templates in _RULES:
            if any(kw.lower() in goal_lower for kw in keywords):
                return step_templates
        return _FALLBACK_RULE

    @staticmethod
    def _resolve_step(step_template: dict, goal: str, context: dict) -> dict:
        """
        Resolve a step template against the context dict.

        Template values are strings like:
          - "{videoPath}"          → context["videoPath"]
          - "{sampleInterval:15}"  → context.get("sampleInterval", "15")
          - "{goal}"               → the original goal string

        Unresolvable keys are left as empty strings (task will fail validation
        downstream, which surfaces a useful error to the caller).
        """
        resolved_payload: dict[str, Any] = {}

        for k, v in step_template.get("payload_template", {}).items():
            resolved_payload[k] = PlannerAgent._resolve_value(v, goal, context)

        return {
            "tool": step_template["tool"],
            "payload": resolved_payload,
        }

    @staticmethod
    def _resolve_value(template_val: Any, goal: str, context: dict) -> Any:
        """Resolve a single template value string."""
        if not isinstance(template_val, str):
            return template_val

        # Match {key} or {key:default}
        m = re.fullmatch(r"\{(\w+)(?::([^}]*))?\}", template_val)
        if not m:
            return template_val

        key, default = m.group(1), m.group(2)

        if key == "goal":
            return goal
        if key in context:
            return context[key]
        if default is not None:
            return default
        return ""   # unresolvable — executor will surface the error
