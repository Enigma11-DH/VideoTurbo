"""
routers/tasks.py — Generic task management + Agent routes.

Endpoints
---------
GET  /api/tasks              List recent tasks (from MemoryManager)
GET  /api/tasks/{task_id}    Get a single task's status (from Redis)
POST /api/tasks              Submit any task type directly
GET  /api/tools              List all registered tools
POST /api/agent/run          Ask the UniVA Agent to plan + execute a goal
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from api.deps import get_redis, get_executor, get_planner, get_memory, get_registry
from api.schemas import (
    TaskSubmitRequest,
    TaskSubmitResponse,
    TaskStatusResponse,
    AgentRunRequest,
    AgentRunResponse,
    AgentPlanStep,
)
from api.agent.planner import PlannerAgent
from api.agent.executor import ExecutorAgent
from api.agent.memory import MemoryManager
from api.agent.registry import ToolRegistry

import redis as redis_lib

router = APIRouter(tags=["Tasks & Agent"])


# ---------------------------------------------------------------------------
# Task status query
# ---------------------------------------------------------------------------

@router.get("/api/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(
    task_id: str,
    r: redis_lib.Redis = Depends(get_redis),
):
    """
    Retrieve the current status of a single task from Redis.
    Compatible with the Node.js /api/tasks/:taskId endpoint.
    """
    data = r.hgetall(f"task:{task_id}")
    if not data:
        raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found")

    return TaskStatusResponse(
        taskId=task_id,
        status=data.get("status", "unknown"),
        progress=int(data.get("progress", 0)),
        result_url=data.get("result_url") or None,
        result_json=data.get("result_json") or None,
        error=data.get("error") or None,
    )


# ---------------------------------------------------------------------------
# Recent task list
# ---------------------------------------------------------------------------

@router.get("/api/tasks")
async def list_recent_tasks(
    limit: int = Query(default=20, ge=1, le=100),
    memory: MemoryManager = Depends(get_memory),
    r: redis_lib.Redis = Depends(get_redis),
):
    """
    Return recent task records (from MemoryManager) enriched with live
    status from Redis.
    """
    records = memory.list_recent_tasks(limit=limit)
    enriched = []
    for rec in records:
        tid = rec.get("taskId", "")
        status_data = r.hgetall(f"task:{tid}") if tid else {}
        enriched.append({
            **rec,
            "status": status_data.get("status", "unknown"),
            "progress": int(status_data.get("progress", 0)),
            "result_url": status_data.get("result_url") or None,
        })
    return {"tasks": enriched, "total": len(enriched)}


# ---------------------------------------------------------------------------
# Generic task submission
# ---------------------------------------------------------------------------

@router.post("/api/tasks", response_model=TaskSubmitResponse, status_code=201)
async def submit_task(
    body: TaskSubmitRequest,
    executor: ExecutorAgent = Depends(get_executor),
):
    """
    Submit any registered task type directly (JSON body).

    Example:
        POST /api/tasks
        {"type": "beat_analyze", "payload": {"audioPath": "/app/uploads/song.mp3"}}
    """
    try:
        task_id = await executor.submit_single(
            task_type=body.type,
            payload=body.payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return TaskSubmitResponse(taskId=task_id)


# ---------------------------------------------------------------------------
# Tool registry inspection
# ---------------------------------------------------------------------------

@router.get("/api/tools")
async def list_tools(registry: ToolRegistry = Depends(get_registry)):
    """Return all registered tools and their payload schemas."""
    return {"tools": registry.list_tools()}


# ---------------------------------------------------------------------------
# UniVA Agent endpoint
# ---------------------------------------------------------------------------

@router.post("/api/agent/run", response_model=AgentRunResponse)
async def agent_run(
    body: AgentRunRequest,
    planner: PlannerAgent = Depends(get_planner),
    executor: ExecutorAgent = Depends(get_executor),
):
    """
    Ask the UniVA Agent to plan and execute a goal.

    1. PlannerAgent maps `goal` + `context` → ordered step list (rule engine)
    2. ExecutorAgent validates each step, enqueues to Redis worker queue
    3. Returns the plan and all submitted taskIds

    Example:
        POST /api/agent/run
        {
          "goal": "分析这个视频的镜头质量",
          "context": {"videoPath": "/app/uploads/clip.mp4"}
        }
    """
    try:
        raw_plan = planner.plan(body.goal, body.context)
        task_ids = await executor.execute_plan(raw_plan, goal=body.goal)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    plan_steps = [AgentPlanStep(tool=s["tool"], payload=s["payload"]) for s in raw_plan]

    return AgentRunResponse(
        goal=body.goal,
        plan=plan_steps,
        taskIds=task_ids,
        message=f"已提交 {len(task_ids)} 个任务",
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@router.get("/api/health")
async def health(r: redis_lib.Redis = Depends(get_redis)):
    """Health check: verifies Redis connection."""
    try:
        r.ping()
        redis_ok = True
    except Exception:
        redis_ok = False

    return {
        "status": "ok" if redis_ok else "degraded",
        "redis": "connected" if redis_ok else "unreachable",
        "version": "2.0.0",
    }
