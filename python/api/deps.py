"""
deps.py — FastAPI dependency injection for VideoTurbo.

All agent components are initialised once at startup (singleton pattern)
and injected into route handlers via FastAPI's Depends() mechanism.

Usage in a router:
    from api.deps import get_redis, get_executor, get_planner

    @router.post("/api/agent/run")
    async def agent_run(
        req: AgentRunRequest,
        planner: PlannerAgent = Depends(get_planner),
        executor: ExecutorAgent = Depends(get_executor),
    ):
        ...
"""
from __future__ import annotations

import os

import redis as redis_lib

from api.agent.registry import ToolRegistry
from api.agent.memory import MemoryManager
from api.agent.planner import PlannerAgent
from api.agent.executor import ExecutorAgent

# ---------------------------------------------------------------------------
# Singletons (initialised on first call, reused thereafter)
# ---------------------------------------------------------------------------

_redis_client: redis_lib.Redis | None = None
_registry: ToolRegistry | None = None
_memory: MemoryManager | None = None
_planner: PlannerAgent | None = None
_executor: ExecutorAgent | None = None


# ---------------------------------------------------------------------------
# Dependency functions
# ---------------------------------------------------------------------------

def get_redis() -> redis_lib.Redis:
    """Return a shared synchronous Redis client."""
    global _redis_client
    if _redis_client is None:
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        _redis_client = redis_lib.from_url(redis_url, decode_responses=True)
    return _redis_client


def get_registry() -> ToolRegistry:
    """Return the shared Tool Registry (singleton)."""
    global _registry
    if _registry is None:
        _registry = ToolRegistry()
    return _registry


def get_memory() -> MemoryManager:
    """Return the shared Memory Manager (singleton)."""
    global _memory
    if _memory is None:
        _memory = MemoryManager(get_redis())
    return _memory


def get_planner() -> PlannerAgent:
    """Return the shared Planner Agent (singleton)."""
    global _planner
    if _planner is None:
        _planner = PlannerAgent(get_registry())
    return _planner


def get_executor() -> ExecutorAgent:
    """Return the shared Executor Agent (singleton)."""
    global _executor
    if _executor is None:
        _executor = ExecutorAgent(get_redis(), get_registry(), get_memory())
    return _executor
