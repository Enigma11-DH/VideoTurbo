"""
main.py — VideoTurbo FastAPI application entry point (port 8000).

Architecture position:
  Frontend (React, port 3000) ──► Node.js server.ts (legacy, port 3000)
                               └──► FastAPI (this file, port 8000)   [new]
                                          │
                                          ├── UniVA Agent (Planner + Executor)
                                          ├── Tool Registry
                                          ├── Memory Manager
                                          └── Redis task queue ──► Python Worker

Startup:
    uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routers.tasks import router as tasks_router
from api.routers.analyze import router as analyze_router
from api.routers.transcribe import router as transcribe_router

# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title="VideoTurbo API",
    description=(
        "AI-powered video editing platform API. "
        "Powered by UniVA Agent (rule-based Planner + Executor) with "
        "Redis-backed task queue and Python AI Worker."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow frontend (port 3000) and any configured origin
# ---------------------------------------------------------------------------

ALLOWED_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:80",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Static file serving — /output/{task_id}/... → local output directory
# ---------------------------------------------------------------------------

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/app/output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")

# ---------------------------------------------------------------------------
# Upload directory
# ---------------------------------------------------------------------------

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(tasks_router)
app.include_router(analyze_router)
app.include_router(transcribe_router)

# ---------------------------------------------------------------------------
# Root info endpoint
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": "VideoTurbo FastAPI",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/api/health",
        "agent": "/api/agent/run",
        "tools": "/api/tools",
    }


# ---------------------------------------------------------------------------
# Entry point (direct run)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("RELOAD", "true").lower() == "true",
    )
