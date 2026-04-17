"""
schemas.py — Pydantic request/response models for VideoTurbo FastAPI.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Task models
# ---------------------------------------------------------------------------

class TaskSubmitRequest(BaseModel):
    """Generic task submission payload."""
    type: str = Field(..., description="Task type: render / analyze / video_analyze / beat_analyze / transcribe / crawl / pipeline")
    payload: dict = Field(default_factory=dict, description="Task-specific payload")


class TaskStatusResponse(BaseModel):
    """Single task status snapshot returned by GET /api/tasks/{task_id}."""
    taskId: str
    status: str
    progress: int = 0
    result_url: str | None = None
    result_json: str | None = None
    error: str | None = None


class TaskSubmitResponse(BaseModel):
    """Returned after successfully enqueuing a task."""
    taskId: str


# ---------------------------------------------------------------------------
# Agent models
# ---------------------------------------------------------------------------

class AgentRunRequest(BaseModel):
    """
    Ask the UniVA Agent to plan and execute a goal.

    Example:
        {"goal": "分析这个视频的镜头质量", "context": {"videoPath": "/app/uploads/clip.mp4"}}
    """
    goal: str = Field(..., description="Free-text description of what to accomplish")
    context: dict = Field(default_factory=dict, description="Context data: file paths, preferences, etc.")


class AgentPlanStep(BaseModel):
    """A single resolved step in the execution plan."""
    tool: str
    payload: dict


class AgentRunResponse(BaseModel):
    """
    Returned after the agent has planned and submitted all tasks.
    """
    goal: str
    plan: list[AgentPlanStep]
    taskIds: list[str]
    message: str = "Plan executed successfully"
