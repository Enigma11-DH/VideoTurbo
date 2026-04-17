"""
memory.py — MemoryManager for UniVA Agent.

Two-layer memory:
  - Short-term  : Python dict (in-process, session-scoped)
  - Long-term   : Redis hash  (persistent across restarts)

Key namespacing:
  - Short-term keys are stored as-is in self._short
  - Long-term keys are stored under Redis hash  "agent:memory"
  - Recent task IDs are stored in Redis list     "agent:recent_tasks"
"""
from __future__ import annotations

import json
import time
from typing import Any


class MemoryManager:
    """
    Layered memory store for the UniVA Agent.

    Short-term memory is fast but session-only.
    Long-term memory persists in Redis and survives restarts.
    """

    MEMORY_HASH = "agent:memory"
    RECENT_TASKS_LIST = "agent:recent_tasks"
    MAX_RECENT_TASKS = 100

    def __init__(self, redis_client):
        self._r = redis_client
        self._short: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Core memory operations
    # ------------------------------------------------------------------

    def remember(self, key: str, value: Any, session_only: bool = False) -> None:
        """
        Write a value to memory.

        Args:
            key          : Arbitrary string key.
            value        : Any JSON-serialisable value.
            session_only : If True, store in short-term memory only.
                           If False (default), also persist to Redis.
        """
        self._short[key] = value
        if not session_only:
            self._r.hset(self.MEMORY_HASH, key, json.dumps(value, ensure_ascii=False))

    def recall(self, key: str, default: Any = None) -> Any:
        """
        Read a value from memory.

        Lookup order: short-term dict → Redis hash → default.
        """
        if key in self._short:
            return self._short[key]
        raw = self._r.hget(self.MEMORY_HASH, key)
        if raw is not None:
            try:
                value = json.loads(raw)
                self._short[key] = value   # promote to short-term
                return value
            except json.JSONDecodeError:
                return raw
        return default

    def forget(self, key: str) -> None:
        """Delete a key from both short-term and Redis memory."""
        self._short.pop(key, None)
        self._r.hdel(self.MEMORY_HASH, key)

    def clear_session(self) -> None:
        """Clear short-term (session) memory without touching Redis."""
        self._short.clear()

    # ------------------------------------------------------------------
    # Task history
    # ------------------------------------------------------------------

    def record_task(self, task_id: str, task_type: str, goal: str | None = None) -> None:
        """
        Append a task record to the recent-tasks list in Redis.
        Keeps only the last MAX_RECENT_TASKS entries.
        """
        entry = json.dumps({
            "taskId": task_id,
            "type": task_type,
            "goal": goal or "",
            "submittedAt": time.time(),
        }, ensure_ascii=False)
        self._r.lpush(self.RECENT_TASKS_LIST, entry)
        self._r.ltrim(self.RECENT_TASKS_LIST, 0, self.MAX_RECENT_TASKS - 1)

    def list_recent_tasks(self, limit: int = 10) -> list[dict]:
        """
        Return up to `limit` most recently submitted tasks from Redis.
        Each entry: {"taskId", "type", "goal", "submittedAt"}
        """
        raw_list = self._r.lrange(self.RECENT_TASKS_LIST, 0, limit - 1)
        result = []
        for raw in raw_list:
            try:
                result.append(json.loads(raw))
            except json.JSONDecodeError:
                pass
        return result

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def all_long_term(self) -> dict:
        """Return the entire long-term memory hash from Redis."""
        raw = self._r.hgetall(self.MEMORY_HASH)
        out = {}
        for k, v in raw.items():
            try:
                out[k] = json.loads(v)
            except json.JSONDecodeError:
                out[k] = v
        return out
