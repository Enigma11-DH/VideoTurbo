import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Redis from "ioredis";
import Database from "better-sqlite3";
import multer from "multer";
import { randomUUID } from "crypto";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Redis ---
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";
const redis = new Redis(REDIS_URL);
const QUEUE_KEY = "task:queue";

// --- SQLite ---
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "db", "videoturbo.db");
function getDb(): Database.Database {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Initialize schema
  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, "utf-8"));
  }
  return db;
}

const db = getDb();

// --- Multer (file upload) ---
const OUTPUT_DIR = path.join(process.cwd(), "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadDir = path.join(OUTPUT_DIR, "uploads");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${randomUUID().slice(0, 12)}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// --- Douyin Parser (kept from original) ---
async function parseDouyinVideo(url: string) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    const finalUrl = res.url;
    const match = finalUrl.match(/video\/(\d+)/);
    if (!match) return null;
    const itemId = match[1];

    const detailUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${itemId}`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    if (detailData.item_list && detailData.item_list.length > 0) {
      const item = detailData.item_list[0];
      let videoUrl = item.video.play_addr.url_list[0];
      videoUrl = videoUrl.replace("playwm", "play");
      return {
        url: videoUrl,
        title: item.desc,
        cover: item.video.cover.url_list[0],
        author: item.author.nickname,
      };
    }
    return null;
  } catch (error) {
    console.error("Douyin parse error:", error);
    return null;
  }
}

// --- CapCut API Helper (kept from original) ---
async function capcutRender(timeline: any[], apiKey: string, baseUrl: string) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  // 1. Create Draft
  const draftRes = await fetch(`${baseUrl}/openapi/capcut-mate/v1/create_draft`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Auto Generated Video" }),
  });
  const draftData = await draftRes.json();
  const draftId = draftData.data?.draft_id;
  if (!draftId) throw new Error("Failed to create CapCut draft");

  // 2. Add Videos
  const videoPayload = timeline.map((clip: any) => ({ url: clip.url, duration: clip.duration }));
  await fetch(`${baseUrl}/openapi/capcut-mate/v1/add_videos`, {
    method: "POST",
    headers,
    body: JSON.stringify({ draft_id: draftId, videos: videoPayload }),
  });

  // 3. Add Captions
  const captionsPayload = timeline
    .filter((c: any) => c.textOverlay)
    .map((clip: any) => ({
      text: clip.textOverlay,
      duration: clip.duration,
      style: clip.textStyle || { font_size: 12, color: "#FFFFFF" },
    }));
  if (captionsPayload.length > 0) {
    await fetch(`${baseUrl}/openapi/capcut-mate/v1/add_captions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ draft_id: draftId, captions: captionsPayload }),
    });
  }

  // 4. Add Effects
  const effectsPayload = timeline
    .filter((c: any) => c.effect)
    .map((clip: any) => ({ effect_id: clip.effect, duration: clip.duration }));
  if (effectsPayload.length > 0) {
    await fetch(`${baseUrl}/openapi/capcut-mate/v1/add_effects`, {
      method: "POST",
      headers,
      body: JSON.stringify({ draft_id: draftId, effects: effectsPayload }),
    });
  }

  // 5. Generate Video
  const genRes = await fetch(`${baseUrl}/openapi/capcut-mate/v1/gen_video`, {
    method: "POST",
    headers,
    body: JSON.stringify({ draft_id: draftId }),
  });
  const genData = await genRes.json();
  return genData.data?.task_id;
}

// ============================================================
// Express App
// ============================================================

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());
  app.use("/output", express.static(OUTPUT_DIR));

  // ---------- Projects ----------

  app.post("/api/projects", (req, res) => {
    try {
      const { name, topic, aspectRatio, duration, voice, bgm } = req.body;
      const id = randomUUID().slice(0, 12);
      db.prepare(
        `INSERT INTO projects (id, name, topic, aspect_ratio, duration, voice, bgm)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, name || "Untitled", topic || "", aspectRatio || "9:16", duration || 30, voice || "alloy", bgm || "none");
      res.json({ id, name });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/projects", (_req, res) => {
    const rows = db.prepare("SELECT * FROM projects ORDER BY created_at DESC LIMIT 50").all();
    res.json(rows);
  });

  app.get("/api/projects/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    row ? res.json(row) : res.status(404).json({ error: "Not found" });
  });

  // ---------- Tasks (submit to Redis queue) ----------

  app.post("/api/tasks/render", async (req, res) => {
    try {
      const { projectId, timeline, pexelsApiKey } = req.body;
      const taskId = randomUUID().slice(0, 12);

      // Persist in SQLite
      db.prepare(
        `INSERT INTO tasks (id, project_id, type, status, progress, payload_json)
         VALUES (?, ?, 'render', 'queued', 0, ?)`
      ).run(taskId, projectId || null, JSON.stringify({ timeline, pexelsApiKey }));

      // Push to Redis queue
      await redis.lpush(
        QUEUE_KEY,
        JSON.stringify({ taskId, type: "render", projectId, payload: { timeline, pexelsApiKey } })
      );

      res.json({ taskId, status: "queued" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/tasks/analyze", async (req, res) => {
    try {
      const { projectId, topic, assets, geminiApiKey } = req.body;
      const taskId = randomUUID().slice(0, 12);

      db.prepare(
        `INSERT INTO tasks (id, project_id, type, status, progress, payload_json)
         VALUES (?, ?, 'analyze', 'queued', 0, ?)`
      ).run(taskId, projectId || null, JSON.stringify({ topic, assets, geminiApiKey }));

      await redis.lpush(
        QUEUE_KEY,
        JSON.stringify({ taskId, type: "analyze", projectId, payload: { topic, assets, geminiApiKey } })
      );

      res.json({ taskId, status: "queued" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/tasks/crawl", async (req, res) => {
    try {
      const { projectId, platform, url } = req.body;
      const taskId = randomUUID().slice(0, 12);

      db.prepare(
        `INSERT INTO tasks (id, project_id, type, status, progress, payload_json)
         VALUES (?, ?, 'crawl', 'queued', 0, ?)`
      ).run(taskId, projectId || null, JSON.stringify({ platform, url }));

      await redis.lpush(
        QUEUE_KEY,
        JSON.stringify({ taskId, type: "crawl", projectId, payload: { platform, url } })
      );

      res.json({ taskId, status: "queued" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    const taskId = req.params.id;
    // Try Redis first (real-time progress)
    const redisData = await redis.hgetall(`task:${taskId}`);
    if (redisData && redisData.status) {
      return res.json({
        id: taskId,
        status: redisData.status,
        progress: parseInt(redisData.progress || "0", 10),
        result_url: redisData.result_url || null,
        result_json: redisData.result_json || null,
        error: redisData.error || null,
      });
    }
    // Fall back to SQLite
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    row ? res.json(row) : res.status(404).json({ error: "Task not found" });
  });

  app.get("/api/tasks", (_req, res) => {
    const rows = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50").all();
    res.json(rows);
  });

  // ---------- Pipeline (end-to-end video generation) ----------

  app.post("/api/pipeline/generate", async (req, res) => {
    try {
      const {
        topic, script, duration, aspectRatio, voice, bgm,
        llmBaseUrl, llmApiKey, llmModel, pexelsApiKey, assets,
      } = req.body;

      if (!topic && !script) {
        return res.status(400).json({ error: "Topic or script is required" });
      }

      // 1. Create project
      const projectId = randomUUID().slice(0, 12);
      db.prepare(
        `INSERT INTO projects (id, name, topic, aspect_ratio, duration, voice, bgm)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(projectId, topic || "Custom Script", topic || "", aspectRatio || "9:16", duration || 30, voice || "alloy", bgm || "none");

      // 2. Create pipeline task
      const taskId = randomUUID().slice(0, 12);
      const payload = {
        topic, script, duration, aspectRatio, voice, bgm,
        llmBaseUrl, llmApiKey, llmModel, pexelsApiKey, assets: assets || [],
      };
      db.prepare(
        `INSERT INTO tasks (id, project_id, type, status, progress, payload_json)
         VALUES (?, ?, 'pipeline', 'queued', 0, ?)`
      ).run(taskId, projectId, JSON.stringify(payload));

      // 3. Push to Redis queue
      await redis.lpush(
        QUEUE_KEY,
        JSON.stringify({ taskId, type: "pipeline", projectId, payload })
      );

      res.json({ projectId, taskId, status: "queued" });
    } catch (e: any) {
      console.error("Pipeline API error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ---------- Assets ----------

  app.post("/api/assets/upload", upload.array("files", 20), (req, res) => {
    try {
      const projectId = req.body.projectId || null;
      const files = req.files as Express.Multer.File[];
      const assets = files.map((f) => {
        const id = randomUUID().slice(0, 12);
        const fileUrl = `/output/uploads/${f.filename}`;
        db.prepare(
          `INSERT INTO assets (id, project_id, type, url, filename, file_path)
           VALUES (?, ?, 'user', ?, ?, ?)`
        ).run(id, projectId, fileUrl, f.originalname, f.path);
        return { id, url: fileUrl, filename: f.originalname };
      });
      res.json({ assets });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/assets/:projectId", (req, res) => {
    const rows = db.prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC").all(req.params.projectId);
    res.json(rows);
  });

  // ---------- Douyin Parser (preserved) ----------

  app.post("/api/douyin/parse", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    const result = await parseDouyinVideo(url);
    result ? res.json(result) : res.status(404).json({ error: "Failed to parse Douyin video" });
  });

  // ---------- CapCut API (preserved) ----------

  app.post("/api/render/capcut", async (req, res) => {
    try {
      const { timeline, capcutApiKey: customApiKey } = req.body;
      const apiKey = customApiKey || process.env.CAPCUT_API_KEY;
      const baseUrl = process.env.CAPCUT_API_BASE_URL || "https://open.capcut.com";

      if (!apiKey || apiKey === "TODO_CAPCUT_KEY") {
        // Simulated flow
        const jobId = "capcut_" + randomUUID().slice(0, 8);
        const jobDir = path.join(OUTPUT_DIR, jobId);
        fs.mkdirSync(jobDir, { recursive: true });
        res.json({ jobId, status: "processing", message: "CapCut rendering started (Simulated)" });

        setTimeout(() => {
          fs.writeFileSync(
            path.join(jobDir, "status.json"),
            JSON.stringify({ status: "completed", url: "https://www.w3schools.com/html/mov_bbb.mp4" })
          );
        }, 5000);
        return;
      }

      const taskId = await capcutRender(timeline, apiKey, baseUrl);
      if (!taskId) throw new Error("Failed to start CapCut video generation");
      res.json({ jobId: taskId, status: "processing", message: "CapCut rendering started", isCapCut: true });
    } catch (error: any) {
      console.error("CapCut Render API error:", error);
      res.status(500).json({ error: "Internal server error during CapCut render" });
    }
  });

  app.get("/api/render/capcut/:taskId", async (req, res) => {
    const { taskId } = req.params;
    const apiKey = process.env.CAPCUT_API_KEY;
    const baseUrl = process.env.CAPCUT_API_BASE_URL || "https://open.capcut.com";

    if (!apiKey || apiKey === "TODO_CAPCUT_KEY") {
      const statusFile = path.join(OUTPUT_DIR, taskId, "status.json");
      if (fs.existsSync(statusFile)) {
        return res.json(JSON.parse(fs.readFileSync(statusFile, "utf-8")));
      }
      return res.json({ status: "processing" });
    }

    try {
      const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
      const statusRes = await fetch(`${baseUrl}/openapi/capcut-mate/v1/gen_video_status`, {
        method: "POST",
        headers,
        body: JSON.stringify({ task_id: taskId }),
      });
      const statusData = await statusRes.json();
      if (statusData.data?.status === "success") {
        res.json({ status: "completed", url: statusData.data.video_url });
      } else if (statusData.data?.status === "failed") {
        res.json({ status: "failed", error: statusData.data.error_msg });
      } else {
        res.json({ status: "processing" });
      }
    } catch (error) {
      console.error("CapCut Status API error:", error);
      res.status(500).json({ error: "Failed to fetch CapCut status" });
    }
  });

  // ---------- Transcribe (Whisper) ----------

  app.post("/api/transcribe", upload.single("video"), async (req, res) => {
    let videoPath: string;
    if (req.file) {
      videoPath = req.file.path;
    } else {
      videoPath = req.body.videoPath;
    }
    if (!videoPath) return res.status(400).json({ error: "videoPath or video file required" });

    const taskId = randomUUID();
    const task = {
      taskId,
      type: "transcribe",
      payload: {
        videoPath,
        burnSubtitles: req.body.burnSubtitles === "true" || req.body.burnSubtitles === true,
        language: req.body.language || null,
      },
    };

    await redis.lpush(QUEUE_KEY, JSON.stringify(task));
    res.json({ taskId });
  });

  // ---------- Video Analyze (OpenCV) ----------

  app.post("/api/video-analyze", upload.single("video"), async (req, res) => {
    let videoPath: string;
    if (req.file) {
      videoPath = req.file.path;
    } else {
      videoPath = req.body.videoPath;
    }
    if (!videoPath) return res.status(400).json({ error: "video file or videoPath required" });

    const taskId = randomUUID();
    const task = {
      taskId,
      type: "video_analyze",
      payload: {
        videoPath,
        sampleInterval: parseInt(req.body.sampleInterval || "15", 10),
      },
    };

    await redis.lpush(QUEUE_KEY, JSON.stringify(task));
    res.json({ taskId });
  });

  // ---------- Beat Analyze (librosa) ----------

  app.post("/api/beat-analyze", upload.single("audio"), async (req, res) => {
    const audioPath = req.file?.path;
    if (!audioPath) return res.status(400).json({ error: "audio file required" });

    const taskId = randomUUID();
    await redis.lpush(QUEUE_KEY, JSON.stringify({
      taskId,
      type: "beat_analyze",
      payload: {
        audioPath,
        everyNBeats: parseInt(req.body.everyNBeats || "2", 10),
      },
    }));
    res.json({ taskId });
  });

  // ---------- Auto-Edit (智能成片：批量素材 + 音频 → 轨道草稿 JSON) ----------

  app.post(
    "/api/auto-edit",
    upload.fields([
      { name: "videos", maxCount: 20 },
      { name: "audio",  maxCount: 1  },
    ]),
    async (req, res) => {
      console.log("[Auto-Edit] Received request");
      
      try {
        const taskId = randomUUID();
        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const videoFiles = files?.videos ?? [];
        const audioFile  = files?.audio?.[0] ?? null;

        const {
          url          = "",
          aspectRatio  = "9:16",
          duration     = "30",
          template     = "vlog",
          llmBaseUrl   = "",
          llmApiKey    = "",
          llmModel     = "",
        } = req.body as Record<string, string>;

        console.log(`[Auto-Edit] Task ID: ${taskId}`);
        console.log(`[Auto-Edit] Videos: ${videoFiles.length} files`);
        console.log(`[Auto-Edit] Audio: ${audioFile ? audioFile.originalname : "none"}`);
        console.log(`[Auto-Edit] URL: ${url || "none"}`);
        console.log(`[Auto-Edit] Config: aspect=${aspectRatio}, duration=${duration}s, template=${template}`);
        
        // Log LLM config (masked)
        if (llmBaseUrl && llmApiKey) {
          console.log(`[Auto-Edit] LLM Provider: ${llmBaseUrl}`);
          console.log(`[Auto-Edit] LLM Model: ${llmModel}`);
          console.log(`[Auto-Edit] LLM API Key: ${llmApiKey.substring(0, 8)}...${llmApiKey.slice(-4)}`);
        } else {
          console.warn("[Auto-Edit] ⚠️ No LLM configuration provided! Task may fail during AI generation.");
        }

        if (videoFiles.length === 0 && !url) {
          console.error("[Auto-Error] No videos or URL provided");
          return res.status(400).json({ error: "请至少上传视频文件或提供参考链接" });
        }

        const payload = {
          video_paths:   videoFiles.map((f) => f.path),
          audio_path:    audioFile?.path ?? null,
          reference_url: url,
          aspect_ratio:  aspectRatio,
          duration_sec:  Number(duration),
          template,
          // Add LLM configuration
          llm_config: {
            base_url: llmBaseUrl,
            api_key:  llmApiKey,
            model:    llmModel,
          },
        };

        console.log("[Auto-Edit] Creating task in Redis...");
        await redis.hset(`task:${taskId}`, { status: "queued", progress: "0" });
        await redis.lpush(QUEUE_KEY, JSON.stringify({
          taskId,
          type: "auto_edit",
          payload,
        }));

        console.log(`[Auto-Edit] ✅ Task created successfully: ${taskId}`);
        res.json({ taskId });
        
      } catch (e: any) {
        console.error("[Auto-Edit] Error:", e.message);
        console.error("[Auto-Edit] Stack:", e.stack);
        
        if (!res.headersSent) {
          res.status(500).json({ 
            error: e.message || "服务器内部错误",
          });
        }
      }
    }
  );

  // ---------- Auto-Analyze (Unified: Video + Beat + Transcribe) ----------

  app.post("/api/auto-analyze", upload.single("video"), async (req, res) => {
    const videoPath = req.file?.path;
    if (!videoPath) return res.status(400).json({ error: "video file required" });

    const analyzeId = randomUUID();
    const audioPath = path.join(OUTPUT_DIR, "uploads", `${analyzeId.slice(0, 12)}_audio.wav`);

    try {
      const { execSync } = await import("child_process");

      execSync(
        `ffmpeg -y -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`,
        { stdio: "pipe" }
      );

      const tasks = {
        video_analyze: { taskId: randomUUID(), type: "video_analyze", payload: { videoPath, sampleInterval: 15 } },
        beat_analyze: { taskId: randomUUID(), type: "beat_analyze", payload: { audioPath, everyNBeats: 2 } },
        transcribe: { taskId: randomUUID(), type: "transcribe", payload: { videoPath, burnSubtitles: false, language: null } },
      };

      for (const task of Object.values(tasks)) {
        await redis.lpush(QUEUE_KEY, JSON.stringify(task));
      }

      db.prepare(
        `INSERT INTO tasks (id, project_id, type, status, progress, payload_json)
         VALUES (?, NULL, 'auto_analyze', 'analyzing', 0, ?)`
      ).run(analyzeId, JSON.stringify({ videoPath, audioPath, subTaskIds: Object.fromEntries(Object.entries(tasks).map(([k, v]) => [k, v.taskId])) }));

      res.json({ analyzeId, subTaskIds: Object.fromEntries(Object.entries(tasks).map(([k, v]) => [k, v.taskId])), status: "analyzing" });
    } catch (error) {
      console.error("[Auto-Analyze] Error:", error);
      res.status(500).json({ error: "Failed to start auto-analysis" });
    }
  });

  app.get("/api/auto-analyze/:analyzeId", async (req, res) => {
    const { analyzeId } = req.params;

    try {
      const taskRow = db.prepare("SELECT * FROM tasks WHERE id = ?").get(analyzeId) as any;
      if (!taskRow || taskRow.type !== "auto_analyze") return res.status(404).json({ error: "Not found" });

      const payload = JSON.parse(taskRow.payload_json);
      const subTaskIds = payload.subTaskIds || {};

      const results: any = {};
      let allCompleted = true;
      let anyFailed = false;

      for (const [type, subTaskId] of Object.entries(subTaskIds)) {
        const statusRes = await fetch(`http://localhost:3000/api/tasks/${subTaskId}`);
        if (!statusRes.ok) { results[type] = { status: "pending" }; allCompleted = false; continue; }

        const statusData = await statusRes.json();
        results[type] = statusData;

        if (statusData.status === "completed") {
          results[type].result_json &&= JSON.parse(statusData.result_json);
        } else if (statusData.status === "failed") {
          anyFailed = true;
          allCompleted = false;
        } else {
          allCompleted = false;
        }
      }

      const overallStatus = anyFailed ? "failed" : allCompleted ? "completed" : "analyzing";

      if (allCompleted && taskRow.status !== "completed") {
        db.prepare("UPDATE tasks SET status = 'completed', progress = 100 WHERE id = ?").run(analyzeId);
      }

      res.json({
        analyzeId,
        status: overallStatus,
        videoAnalysis: results.video_analyze?.result_json || null,
        beatAnalysis: results.beat_analyze?.result_json || null,
        transcription: results.transcribe?.result_json || null,
        subTasks: results,
      });
    } catch (error) {
      console.error("[Auto-Analyze Status] Error:", error);
      res.status(500).json({ error: "Failed to get analysis status" });
    }
  });

  // ---------- Legacy render status (for backward compat) ----------

  app.get("/api/render/:jobId", (req, res) => {
    const { jobId } = req.params;
    const statusFile = path.join(OUTPUT_DIR, jobId, "status.json");
    if (fs.existsSync(statusFile)) {
      return res.json(JSON.parse(fs.readFileSync(statusFile, "utf-8")));
    }
    res.json({ status: "processing" });
  });

  // ---------- LLM API Test Endpoint ----------

  app.post("/api/test-llm", async (req, res) => {
    console.log("[Test-LLM] Received API test request");
    
    try {
      const { baseUrl, apiKey, model } = req.body;

      console.log(`[Test-LLM] Testing connection to: ${baseUrl}`);
      console.log(`[Test-LLM] Model: ${model}`);

      if (!baseUrl || !apiKey || !model) {
        console.error("[Test-LLM] Missing required fields:", { 
          hasBaseUrl: !!baseUrl, 
          hasApiKey: !!apiKey, 
          hasModel: !!model 
        });
        return res.status(400).json({ 
          success: false, 
          error: "Missing required fields: baseUrl, apiKey, model" 
        });
      }

      const chatUrl = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
      
      console.log(`[Test-LLM] Sending test request to: ${chatUrl}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      try {
        const llmRes = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "user", content: "Hello, this is a test message. Please respond with 'OK' only." }
            ],
            max_tokens: 10,
            temperature: 0.1,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        console.log(`[Test-LLM] Response status: ${llmRes.status}`);
        console.log(`[Test-LLM] Response OK: ${llmRes.ok}`);

        const responseText = await llmRes.text();
        console.log(`[Test-LLM] Response body (first 200 chars): ${responseText.substring(0, 200)}`);

        if (!llmRes.ok) {
          let errorDetail = `HTTP ${llmRes.status}`;
          
          try {
            const errorData = JSON.parse(responseText);
            errorDetail = errorData.error?.message || errorData.message || errorDetail;
            
            // Handle common API errors
            if (llmRes.status === 401) {
              errorDetail = "API Key 无效或已过期，请检查您的密钥";
            } else if (llmRes.status === 403) {
              errorDetail = "访问被拒绝，请检查 API Key 权限";
            } else if (llmRes.status === 404) {
              errorDetail = "模型不存在或 URL 错误，请检查 Base URL 和模型名称";
            } else if (llmRes.status === 429) {
              errorDetail = "请求过于频繁，请稍后重试";
            }
          } catch (e) {
            errorDetail = `${errorDetail}: ${responseText.substring(0, 200)}`;
          }

          console.error(`[Test-LLM] API Error: ${errorDetail}`);
          return res.status(llmRes.status).json({
            success: false,
            error: errorDetail,
            statusCode: llmRes.status,
          });
        }

        // Try to parse as JSON
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error(`[Test-LLM] Failed to parse JSON response:`, parseError);
          return res.status(502).json({
            success: false,
            error: `API 返回了无效的 JSON 格式。原始响应: ${responseText.substring(0, 300)}...`,
          });
        }

        // Validate response structure
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
          console.error(`[Test-LLM] Invalid response structure:`, Object.keys(data));
          return res.status(502).json({
            success: false,
            error: `API 响应格式异常：缺少 choices 字段。响应结构: ${JSON.stringify(Object.keys(data))}`,
          });
        }

        const content = data.choices[0]?.message?.content;
        
        console.log(`[Test-LLM] ✅ Connection successful! Model response: "${content}"`);
        
        return res.json({
          success: true,
          model: model,
          provider: baseUrl,
          responsePreview: content?.substring(0, 100),
          message: "连接成功",
        });

      } catch (fetchError: any) {
        clearTimeout(timeout);
        
        console.error(`[Test-LLM] Network/Fetch Error:`, fetchError);
        
        let errorMessage;
        if (fetchError.name === 'AbortError') {
          errorMessage = "连接超时（15秒），请检查网络或 API 地址是否正确";
        } else if (fetchError.code === 'ECONNREFUSED') {
          errorMessage = `无法连接到服务器 (${baseUrl})，请检查 Base URL 是否正确`;
        } else if (fetchError.code === 'ENOTFOUND') {
          errorMessage = `DNS 解析失败，无法找到主机: ${baseUrl}`;
        } else {
          errorMessage = `网络错误: ${fetchError.message}`;
        }

        return res.status(502).json({
          success: false,
          error: errorMessage,
        });
      }

    } catch (error: any) {
      console.error("[Test-LLM] Unexpected error:", error);
      return res.status(500).json({
        success: false,
        error: `服务器内部错误: ${error.message}`,
      });
    }
  });

  // ---------- Enhanced Auto-Edit Endpoint with Better Error Handling ----------

  // Override the auto-edit endpoint to add better logging and error handling
  app._router.stack.forEach((layer: any, i: number) => {
    if (layer.route?.path === "/api/auto-edit" && layer.route?.methods.post) {
      console.log("[Server] Found /api/auto-edit endpoint at stack index", i);
    }
  });

  // ---------- Vite Dev Server ----------

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[VideoTurbo] API Gateway running on http://localhost:${PORT}`);
    console.log(`[VideoTurbo] Redis: ${REDIS_URL}`);
    console.log(`[VideoTurbo] SQLite: ${DB_PATH}`);
  });
}

startServer().catch(console.error);
