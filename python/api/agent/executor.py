"""
executor.py — Executor Agent for UniVA.

The Executor receives an ordered plan (list of resolved steps from Planner)
and submits each step as a task to the Redis queue consumed by worker.py.

Responsibilities:
  1. Validate each step's payload against the ToolRegistry.
  2. Generate a unique taskId (UUID4) per step.
  3. Push the task JSON to the Redis queue ("task:queue").
  4. Record each submitted taskId in MemoryManager.
  5. Return the list of submitted taskIds.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from api.agent.registry import ToolRegistry
from api.agent.memory import MemoryManager


QUEUE_KEY = "task:queue"


class ExecutorAgent:
    """
    Validates and submits an agent plan to the Redis worker queue.

    Usage:
        executor = ExecutorAgent(redis_client, registry, memory)
        task_ids = await executor.execute_plan(plan, goal="分析视频质量")
    """

    def __init__(self, redis_client, registry: ToolRegistry, memory: MemoryManager):
        self._r = redis_client
        self._registry = registry
        self._memory = memory

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute_plan(
        self,
        plan: list[dict],
        goal: str | None = None,
    ) -> list[str]:
        """
        Execute each step in the plan sequentially.

        For each step:
          - Validate payload using ToolRegistry
          - Enqueue to Redis
          - Record in MemoryManager

        Returns a list of taskId strings (one per submitted step).
        Raises ValueError on the first validation failure.
        """
        task_ids: list[str] = []

        for i, step in enumerate(plan):
            tool_name = step.get("tool", "")
            payload = step.get("payload", {})

            # 1. Look up tool
            tool = self._registry.get_or_raise(tool_name)

            # 2. Validate required payload keys
            missing = tool.validate_payload(payload)
            if missing:
                raise ValueError(
                    f"Step {i + 1} ({tool_name}): missing required payload keys: {missing}"
                )

            # 3. Generate task ID
            task_id = str(uuid.uuid4())

            # 4. Build task message
            task_msg: dict[str, Any] = {
                "taskId": task_id,
                "type": tool.task_type,
                "payload": payload,
            }
            if goal:
                task_msg["goal"] = goal

            # 5. Push to Redis queue
            self._r.lpush(QUEUE_KEY, json.dumps(task_msg, ensure_ascii=False))

            # 6. Initialise task status in Redis hash (queued)
            self._r.hset(f"task:{task_id}", mapping={
                "status": "queued",
                "progress": "0",
                "type": tool.task_type,
                "goal": goal or "",
            })

            # 7. Record in memory
            self._memory.record_task(task_id, tool.task_type, goal)

            task_ids.append(task_id)
            print(f"[Executor] Submitted task {task_id} type={tool.task_type}")

        return task_ids

    async def submit_single(
        self,
        task_type: str,
        payload: dict,
        goal: str | None = None,
    ) -> str:
        """
        Convenience method: submit a single task by task_type + payload.
        Validates that task_type is a known tool.task_type in the registry.
        Returns the new taskId.
        """
        # Find tool by task_type
        matching = [
            t for t in self._registry.list_tools()
            if t["task_type"] == task_type
        ]
        if not matching:
            raise ValueError(f"No tool registered for task_type='{task_type}'")

        tool_name = matching[0]["name"]
        return (await self.execute_plan(
            [{"tool": tool_name, "payload": payload}],
            goal=goal,
        ))[0]
