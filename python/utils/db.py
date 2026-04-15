"""
SQLite Database Helper — CRUD operations for VideoTurbo.
"""
import os
import sqlite3
import uuid
from datetime import datetime


DB_PATH = os.environ.get("DB_PATH", os.path.join(os.getcwd(), "db", "videoturbo.db"))


def get_db() -> sqlite3.Connection:
    """Get a SQLite connection, creating DB and tables if needed."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    # Initialize schema if tables don't exist
    schema_path = os.path.join(os.path.dirname(DB_PATH), "schema.sql")
    if os.path.exists(schema_path):
        with open(schema_path) as f:
            conn.executescript(f.read())

    return conn


def create_project(
    db: sqlite3.Connection,
    name: str,
    topic: str = "",
    aspect_ratio: str = "9:16",
    duration: int = 30,
    voice: str = "alloy",
    bgm: str = "none",
) -> str:
    """Insert a new project and return its ID."""
    project_id = uuid.uuid4().hex[:12]
    db.execute(
        """INSERT INTO projects (id, name, topic, aspect_ratio, duration, voice, bgm)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (project_id, name, topic, aspect_ratio, duration, voice, bgm),
    )
    db.commit()
    return project_id


def create_task(
    db: sqlite3.Connection,
    task_id: str,
    project_id: str | None = None,
    task_type: str = "render",
    payload_json: str = "{}",
) -> str:
    """Insert a new task record."""
    db.execute(
        """INSERT INTO tasks (id, project_id, type, status, progress, payload_json)
           VALUES (?, ?, ?, 'queued', 0, ?)""",
        (task_id, project_id, task_type, payload_json),
    )
    db.commit()
    return task_id


def update_task(
    db: sqlite3.Connection,
    task_id: str,
    status: str | None = None,
    progress: int | None = None,
    result_url: str | None = None,
    error: str | None = None,
):
    """Update task fields."""
    updates = []
    params = []
    if status is not None:
        updates.append("status = ?")
        params.append(status)
    if progress is not None:
        updates.append("progress = ?")
        params.append(progress)
    if result_url is not None:
        updates.append("result_url = ?")
        params.append(result_url)
    if error is not None:
        updates.append("error = ?")
        params.append(error)

    if not updates:
        return

    updates.append("updated_at = datetime('now')")
    params.append(task_id)

    db.execute(
        f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?",
        params,
    )
    db.commit()


def get_task(db: sqlite3.Connection, task_id: str) -> dict | None:
    """Fetch a single task by ID."""
    row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return dict(row) if row else None


def list_tasks(db: sqlite3.Connection, limit: int = 50) -> list[dict]:
    """List recent tasks."""
    rows = db.execute(
        "SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def list_projects(db: sqlite3.Connection, limit: int = 50) -> list[dict]:
    """List recent projects."""
    rows = db.execute(
        "SELECT * FROM projects ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def create_asset(
    db: sqlite3.Connection,
    project_id: str,
    url: str,
    filename: str = "",
    asset_type: str = "user",
    file_path: str | None = None,
    source_platform: str | None = None,
    metadata_json: str | None = None,
) -> str:
    """Insert a new asset record."""
    asset_id = uuid.uuid4().hex[:12]
    db.execute(
        """INSERT INTO assets (id, project_id, type, url, filename, file_path, source_platform, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (asset_id, project_id, asset_type, url, filename, file_path, source_platform, metadata_json),
    )
    db.commit()
    return asset_id
