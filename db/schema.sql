-- VideoTurbo Database Schema
-- SQLite 3

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    script TEXT DEFAULT '',
    aspect_ratio TEXT NOT NULL DEFAULT '9:16',
    duration INTEGER NOT NULL DEFAULT 30,
    voice TEXT NOT NULL DEFAULT 'alloy',
    bgm TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tasks table (mirrors Redis queue for persistence)
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    type TEXT NOT NULL DEFAULT 'render',  -- render | analyze | crawl
    status TEXT NOT NULL DEFAULT 'queued', -- queued | processing | rendering | analyzing | crawling | completed | failed
    progress INTEGER NOT NULL DEFAULT 0,
    result_url TEXT,
    error TEXT,
    payload_json TEXT,  -- JSON blob with task-specific params
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Assets table (uploaded files + platform fetched)
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    type TEXT NOT NULL DEFAULT 'user',  -- user | platform
    url TEXT NOT NULL,
    filename TEXT NOT NULL DEFAULT '',
    file_path TEXT,  -- local file path on server
    metadata_json TEXT,  -- JSON blob: duration, resolution, size, etc.
    source_platform TEXT,  -- douyin | kuaishou | youtube | pexels | null
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- API Configs table (user-provided third-party API keys)
CREATE TABLE IF NOT EXISTS api_configs (
    id TEXT PRIMARY KEY,
    service_name TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL DEFAULT '',
    base_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_api_configs_service ON api_configs(service_name);
