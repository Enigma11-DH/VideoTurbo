import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import * as googleTTS from "google-tts-api";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}
if (ffprobeStatic && ffprobeStatic.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
}

async function downloadFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Serve the generated videos
  app.use('/output', express.static(path.join(process.cwd(), 'output')));

  app.post("/api/render", async (req, res) => {
    try {
      const { timeline } = req.body;
      if (!timeline || !Array.isArray(timeline) || timeline.length === 0) {
        return res.status(400).json({ error: "Invalid timeline" });
      }

      const outputDir = path.join(process.cwd(), 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const jobId = Math.random().toString(36).substring(7);
      const jobDir = path.join(outputDir, jobId);
      fs.mkdirSync(jobDir, { recursive: true });

      // We'll process this asynchronously so we don't block the request
      // In a real app, you'd use a job queue like BullMQ
      res.json({ jobId, status: "processing", message: "Video rendering started" });

      // Run rendering in background
      (async () => {
        try {
          console.log(`[Job ${jobId}] Starting render...`);
          
          // 1. Download all videos and generate TTS
          const downloadedVideos: string[] = [];
          
          for (let i = 0; i < timeline.length; i++) {
            const clip = timeline[i];
            const videoPath = path.join(jobDir, `clip_${i}.mp4`);
            console.log(`[Job ${jobId}] Downloading clip ${i}...`);
            await downloadFile(clip.url, videoPath);
            downloadedVideos.push(videoPath);
          }

          // 2. Simple concatenation using fluent-ffmpeg
          const outputPath = path.join(jobDir, 'final.mp4');
          console.log(`[Job ${jobId}] Merging videos...`);

          const command = ffmpeg();
          downloadedVideos.forEach(v => command.input(v));
          
          await new Promise((resolve, reject) => {
            command
              .on('end', resolve)
              .on('error', (err) => {
                console.error(`[Job ${jobId}] FFmpeg Error:`, err);
                reject(err);
              })
              .mergeToFile(outputPath, jobDir);
          });

          console.log(`[Job ${jobId}] Render complete: ${outputPath}`);
          
          // Save status
          fs.writeFileSync(path.join(jobDir, 'status.json'), JSON.stringify({
            status: 'completed',
            url: `/output/${jobId}/final.mp4`
          }));

        } catch (err) {
          console.error(`[Job ${jobId}] Failed:`, err);
          fs.writeFileSync(path.join(jobDir, 'status.json'), JSON.stringify({
            status: 'failed',
            error: String(err)
          }));
        }
      })();

    } catch (error) {
      console.error("Render API error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/render/:jobId", (req, res) => {
    const { jobId } = req.params;
    const statusFile = path.join(process.cwd(), 'output', jobId, 'status.json');
    if (fs.existsSync(statusFile)) {
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      return res.json(status);
    }
    res.json({ status: 'processing' });
  });

  // CapCut API Integration
  app.post("/api/render/capcut", async (req, res) => {
    try {
      const { timeline } = req.body;
      const apiKey = process.env.CAPCUT_API_KEY;
      const baseUrl = process.env.CAPCUT_API_BASE_URL || "https://open.capcut.com";

      if (!apiKey || apiKey === "TODO_CAPCUT_KEY") {
        // Mock the CapCut flow if no key is provided
        console.log("[CapCut] No API key provided. Simulating CapCut API flow...");
        const jobId = "capcut_" + Math.random().toString(36).substring(7);
        const outputDir = path.join(process.cwd(), 'output', jobId);
        fs.mkdirSync(outputDir, { recursive: true });
        
        res.json({ jobId, status: "processing", message: "CapCut rendering started (Simulated)" });

        setTimeout(() => {
          console.log(`[CapCut Job ${jobId}] Simulated render complete.`);
          fs.writeFileSync(path.join(outputDir, 'status.json'), JSON.stringify({
            status: 'completed',
            url: `https://www.w3schools.com/html/mov_bbb.mp4` // Simulated output
          }));
        }, 5000);
        return;
      }

      // Real CapCut API Flow
      const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      };

      // 1. Create Draft
      console.log("[CapCut] Creating draft...");
      const draftRes = await fetch(`${baseUrl}/openapi/capcut-mate/v1/create_draft`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: "Auto Generated Video" })
      });
      const draftData = await draftRes.json();
      const draftId = draftData.data?.draft_id;

      if (!draftId) throw new Error("Failed to create CapCut draft");

      // 2. Add Videos
      console.log("[CapCut] Adding videos...");
      const videoPayload = timeline.map((clip: any) => ({
        url: clip.url,
        duration: clip.duration
      }));
      await fetch(`${baseUrl}/openapi/capcut-mate/v1/add_videos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ draft_id: draftId, videos: videoPayload })
      });

      // 3. Add Captions (if any)
      const captionsPayload = timeline.filter((c: any) => c.textOverlay).map((clip: any) => ({
        text: clip.textOverlay,
        duration: clip.duration
      }));
      if (captionsPayload.length > 0) {
        console.log("[CapCut] Adding captions...");
        await fetch(`${baseUrl}/openapi/capcut-mate/v1/add_captions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ draft_id: draftId, captions: captionsPayload })
        });
      }

      // 4. Generate Video
      console.log("[CapCut] Generating video...");
      const genRes = await fetch(`${baseUrl}/openapi/capcut-mate/v1/gen_video`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ draft_id: draftId })
      });
      const genData = await genRes.json();
      const taskId = genData.data?.task_id;

      if (!taskId) throw new Error("Failed to start CapCut video generation");

      // Return the task ID to the client so it can poll
      res.json({ jobId: taskId, status: "processing", message: "CapCut rendering started", isCapCut: true });

    } catch (error) {
      console.error("CapCut Render API error:", error);
      res.status(500).json({ error: "Internal server error during CapCut render" });
    }
  });

  app.get("/api/render/capcut/:taskId", async (req, res) => {
    const { taskId } = req.params;
    const apiKey = process.env.CAPCUT_API_KEY;
    const baseUrl = process.env.CAPCUT_API_BASE_URL || "https://open.capcut.com";

    if (!apiKey || apiKey === "TODO_CAPCUT_KEY") {
      // If we are simulating, just route to the standard mock status
      const statusFile = path.join(process.cwd(), 'output', taskId, 'status.json');
      if (fs.existsSync(statusFile)) {
        const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
        return res.json(status);
      }
      return res.json({ status: 'processing' });
    }

    try {
      const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      };
      const statusRes = await fetch(`${baseUrl}/openapi/capcut-mate/v1/gen_video_status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ task_id: taskId })
      });
      const statusData = await statusRes.json();
      
      if (statusData.data?.status === 'success') {
        res.json({ status: 'completed', url: statusData.data.video_url });
      } else if (statusData.data?.status === 'failed') {
        res.json({ status: 'failed', error: statusData.data.error_msg });
      } else {
        res.json({ status: 'processing' });
      }
    } catch (error) {
      console.error("CapCut Status API error:", error);
      res.status(500).json({ error: "Failed to fetch CapCut status" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
