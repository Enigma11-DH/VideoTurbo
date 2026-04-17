import { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileVideo,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ScanLine,
  Copy,
  Check,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useTaskStore } from "@/lib/store";
import { toast } from "sonner";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface AnalysisReport {
  duration: number;
  resolution: [number, number];
  fps: number;
  aspect_ratio: string;
  quality_score: number;
  avg_blur_score: number;
  usable_segments: { start: number; end: number }[];
  bad_segments: { start: number; end: number; reason: string }[];
  cut_points: number[];
  face_detected: boolean;
  face_ratio: number;
  suggested_crop_9_16: { x: number; y: number; w: number; h: number };
  black_borders: { top: number; bottom: number; left: number; right: number };
  suggested_clean_crop: { x: number; y: number; w: number; h: number };
  duplicate_count: number;
  color_tone: string;
  thumbnail_url: string;
}

type AnalyzeState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "polling"; taskId: string; progress: number }
  | { phase: "done"; report: AnalysisReport }
  | { phase: "error"; message: string };

const ACCEPTED_TYPES = ".mp4,.mov,.mkv,.avi,.webm,.m4v";
const MAX_FILE_MB = 500;

const SAMPLE_OPTIONS = [
  { value: "5", label: "精细（每 5 帧）— 慢" },
  { value: "15", label: "标准（每 15 帧）— 推荐" },
  { value: "30", label: "快速（每 30 帧）— 快" },
];

const COLOR_TONE_LABELS: Record<string, string> = {
  warm: "暖色调",
  cool: "冷色调",
  neutral: "中性色调",
  dark: "暗调",
};

const COLOR_TONE_COLORS: Record<string, string> = {
  warm: "bg-orange-500/20 text-orange-600",
  cool: "bg-blue-500/20 text-blue-600",
  neutral: "bg-zinc-500/20 text-zinc-600",
  dark: "bg-zinc-800/20 text-zinc-400",
};

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export function VideoAnalyzer() {
  const { language } = useTaskStore();

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [sampleInterval, setSampleInterval] = useState("15");
  const [state, setState] = useState<AnalyzeState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- File handling ----

  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`文件超过 ${MAX_FILE_MB}MB 限制`);
      return;
    }
    setFile(f);
    setState({ phase: "idle" });
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const clearFile = () => {
    setFile(null);
    setState({ phase: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  // ---- Polling ----

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const startPolling = (taskId: string) => {
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();
        const progress = data.progress ?? 0;

        if (data.status === "completed") {
          stopPolling();
          // result_json contains the analysis report
          let report: AnalysisReport | null = null;
          if (data.result_json) {
            try {
              report = JSON.parse(data.result_json);
            } catch {}
          }
          if (!report) {
            setState({ phase: "error", message: "分析完成但报告解析失败" });
            return;
          }
          setState({ phase: "done", report });
          toast.success("视频分析完成！");
        } else if (data.status === "failed") {
          stopPolling();
          setState({ phase: "error", message: data.error || "分析失败" });
          toast.error("分析失败：" + (data.error || "未知错误"));
        } else {
          setState({ phase: "polling", taskId, progress });
        }
      } catch {
        // transient error — keep polling
      }
    }, 2500);
  };

  // ---- Submit ----

  const handleSubmit = async () => {
    if (!file) return;
    setState({ phase: "uploading" });

    try {
      const formData = new FormData();
      formData.append("video", file);
      formData.append("sampleInterval", sampleInterval);

      const res = await fetch("/api/video-analyze", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { taskId } = await res.json();
      setState({ phase: "polling", taskId, progress: 0 });
      startPolling(taskId);
    } catch (err: any) {
      setState({ phase: "error", message: err.message || "上传失败" });
      toast.error("上传失败：" + (err.message || "未知错误"));
    }
  };

  // ---- Copy report ----

  const copyReport = () => {
    if (state.phase !== "done") return;
    navigator.clipboard.writeText(JSON.stringify(state.report, null, 2)).then(() => {
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isProcessing = state.phase === "uploading" || state.phase === "polling";
  const progressValue = state.phase === "polling" ? state.progress : 0;
  const phaseLabel =
    state.phase === "uploading" ? "上传中..." : "OpenCV 分析中...";

  // ---- Render ----

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <ScanLine className="w-8 h-8 text-primary" />
          视频分析
        </h1>
        <p className="text-muted-foreground mt-2">
          上传视频，OpenCV 自动完成画面质量评估、镜头切换检测、人脸定位、黑边检测、色调分析等，输出结构化分析报告。
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !file && inputRef.current?.click()}
        className={[
          "relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer",
          dragOver
            ? "border-primary bg-primary/5"
            : file
              ? "border-emerald-500 bg-emerald-500/5 cursor-default"
              : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={onInputChange}
        />
        {file ? (
          <>
            <FileVideo className="w-12 h-12 text-emerald-500" />
            <div className="text-center">
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-3 right-3 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); clearFile(); }}
            >
              <X className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium text-sm">拖拽视频到这里，或点击选择</p>
              <p className="text-xs text-muted-foreground mt-1">
                支持 MP4 · MOV · MKV · AVI · WebM（最大 {MAX_FILE_MB}MB）
              </p>
            </div>
          </>
        )}
      </div>

      {/* Options */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">采样密度</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                密度越高分析越精准，但处理时间越长
              </p>
            </div>
            <Select value={sampleInterval} onValueChange={setSampleInterval}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAMPLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {phaseLabel}
            </span>
            <span className="text-muted-foreground">{progressValue}%</span>
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>
      )}

      {/* Error */}
      {state.phase === "error" && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
      )}

      {/* Result Report */}
      {state.phase === "done" && (
        <AnalysisReportView
          report={state.report}
          onCopy={copyReport}
          copied={copied}
          onReset={() => { clearFile(); }}
        />
      )}

      {/* Submit */}
      {state.phase !== "done" && (
        <Button
          className="w-full"
          size="lg"
          disabled={!file || isProcessing}
          onClick={handleSubmit}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {phaseLabel}
            </>
          ) : (
            <>
              <ScanLine className="w-4 h-4 mr-2" />
              开始分析
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Report view
// --------------------------------------------------------------------------

function AnalysisReportView({
  report,
  onCopy,
  copied,
  onReset,
}: {
  report: AnalysisReport;
  onCopy: () => void;
  copied: boolean;
  onReset: () => void;
}) {
  const totalDur = report.duration || 1;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-600 font-medium">
          <CheckCircle2 className="w-5 h-5" />
          分析完成
        </div>
        <Button variant="outline" size="sm" onClick={onCopy}>
          {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
          复制报告 JSON
        </Button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="时长" value={`${report.duration}s`} />
        <MetricCard label="分辨率" value={`${report.resolution[0]}×${report.resolution[1]}`} />
        <MetricCard label="帧率" value={`${report.fps} fps`} />
        <MetricCard
          label="质量评分"
          value={`${Math.round(report.quality_score * 100)}%`}
          highlight={report.quality_score >= 0.7}
        />
      </div>

      {/* Thumbnail */}
      {report.thumbnail_url && (
        <Card>
          <CardContent className="pt-4 flex items-start gap-4">
            <ImageIcon className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
            <div>
              <p className="text-sm font-medium mb-2">最佳帧缩略图</p>
              <img
                src={report.thumbnail_url}
                alt="Thumbnail"
                className="rounded-lg max-h-40 object-contain border"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">片段时间轴</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Usable / bad segments bar */}
          <div className="flex h-6 rounded overflow-hidden w-full bg-muted">
            {report.usable_segments.map((seg, i) => (
              <div
                key={`u-${i}`}
                className="bg-emerald-500 opacity-80"
                style={{ width: `${((seg.end - seg.start) / totalDur) * 100}%` }}
                title={`可用 ${seg.start}s–${seg.end}s`}
              />
            ))}
            {report.bad_segments.map((seg, i) => (
              <div
                key={`b-${i}`}
                className="bg-red-400 opacity-60"
                style={{
                  position: "absolute",
                  left: `${(seg.start / totalDur) * 100}%`,
                  width: `${((seg.end - seg.start) / totalDur) * 100}%`,
                  height: "24px",
                }}
                title={`${seg.reason} ${seg.start}s–${seg.end}s`}
              />
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
              可用 ({report.usable_segments.length} 段)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-400 inline-block" />
              问题帧 ({report.bad_segments.length} 段)
            </span>
          </div>

          {/* Cut points */}
          {report.cut_points.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                检测到 {report.cut_points.length} 个镜头切换点
              </p>
              <div className="flex flex-wrap gap-1">
                {report.cut_points.slice(0, 20).map((t, i) => (
                  <Badge key={i} variant="secondary" className="text-xs font-mono">
                    {t}s
                  </Badge>
                ))}
                {report.cut_points.length > 20 && (
                  <Badge variant="secondary" className="text-xs">
                    +{report.cut_points.length - 20} 更多
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Face & crop */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <p className="text-sm font-medium">人脸检测</p>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={report.face_detected ? "bg-green-500/20 text-green-600" : "bg-zinc-500/20"}
              >
                {report.face_detected ? "检测到人脸" : "未检测到人脸"}
              </Badge>
              {report.face_detected && (
                <span className="text-xs text-muted-foreground">
                  占画面 {Math.round(report.face_ratio * 100)}%
                </span>
              )}
            </div>
            <Separator />
            <p className="text-sm font-medium">建议 9:16 裁剪</p>
            <code className="text-xs bg-muted px-2 py-1 rounded block">
              x:{report.suggested_crop_9_16.x} y:{report.suggested_crop_9_16.y}{" "}
              {report.suggested_crop_9_16.w}×{report.suggested_crop_9_16.h}
            </code>
          </CardContent>
        </Card>

        {/* Black borders + color */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <p className="text-sm font-medium">黑边检测</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>上边：{report.black_borders.top}px</span>
              <span>下边：{report.black_borders.bottom}px</span>
              <span>左边：{report.black_borders.left}px</span>
              <span>右边：{report.black_borders.right}px</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">画面色调</p>
              <Badge
                variant="secondary"
                className={COLOR_TONE_COLORS[report.color_tone] ?? ""}
              >
                {COLOR_TONE_LABELS[report.color_tone] ?? report.color_tone}
              </Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">重复片段</p>
              <Badge
                variant="secondary"
                className={report.duplicate_count > 0 ? "bg-yellow-500/20 text-yellow-600" : ""}
              >
                {report.duplicate_count > 0 ? `${report.duplicate_count} 组相似帧` : "无重复"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Re-analyze */}
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onReset}>
        分析另一个视频
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Helper components
// --------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-emerald-600" : ""}`}>{value}</p>
    </div>
  );
}
