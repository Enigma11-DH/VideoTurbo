import { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileVideo,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Captions,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useTaskStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { toast } from "sonner";

type TranscribeState =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "polling"; taskId: string; progress: number }
  | { phase: "done"; srtUrl: string; videoUrl?: string; burnedIn: boolean }
  | { phase: "error"; message: string };

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "自动检测" },
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
];

const ACCEPTED_TYPES = ".mp4,.mov,.mkv,.avi,.webm,.m4v";
const MAX_FILE_MB = 500;

export function Transcribe() {
  const { language } = useTaskStore();

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("auto");
  const [burnSubtitles, setBurnSubtitles] = useState(false);
  const [state, setState] = useState<TranscribeState>({ phase: "idle" });

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
          // result_url is the primary output; srt_url is always the .srt
          const resultUrl: string = data.result_url || "";
          const isBurned = resultUrl.endsWith(".mp4");
          setState({
            phase: "done",
            srtUrl: isBurned
              ? resultUrl.replace("with_subtitles.mp4", "subtitles.srt")
              : resultUrl,
            videoUrl: isBurned ? resultUrl : undefined,
            burnedIn: isBurned,
          });
          toast.success("转录完成！");
        } else if (data.status === "failed") {
          stopPolling();
          setState({ phase: "error", message: data.error || "转录失败" });
          toast.error("转录失败：" + (data.error || "未知错误"));
        } else {
          setState({ phase: "polling", taskId, progress });
        }
      } catch {
        // transient network error — keep polling
      }
    }, 2500);
  };

  // ---- Submit ----

  const handleSubmit = async () => {
    if (!file) return;

    setState({ phase: "uploading", progress: 0 });

    try {
      const formData = new FormData();
      formData.append("video", file);
      formData.append("burnSubtitles", String(burnSubtitles));
      if (selectedLanguage !== "auto") {
        formData.append("language", selectedLanguage);
      }

      const res = await fetch("/api/transcribe", {
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

  const isProcessing =
    state.phase === "uploading" || state.phase === "polling";

  const progressValue =
    state.phase === "uploading"
      ? state.progress
      : state.phase === "polling"
        ? state.progress
        : 0;

  const phaseLabel =
    state.phase === "uploading"
      ? "上传中..."
      : state.phase === "polling"
        ? "Whisper 转录中..."
        : "";

  // ---- Render ----

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Captions className="w-8 h-8 text-primary" />
          字幕生成
        </h1>
        <p className="text-muted-foreground mt-2">
          上传视频，使用 Whisper 自动转录语音并生成 .srt 字幕文件，可选烧录字幕进视频。
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
              ? "border-green-500 bg-green-500/5 cursor-default"
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
            <FileVideo className="w-12 h-12 text-green-500" />
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
        <CardContent className="pt-6 space-y-5">
          {/* Language */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">语言</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                选择视频中的语言，或使用自动检测
              </p>
            </div>
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Burn subtitles */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">烧录字幕到视频</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                将字幕永久嵌入视频画面（硬字幕）
              </p>
            </div>
            <Switch
              checked={burnSubtitles}
              onCheckedChange={setBurnSubtitles}
            />
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
          <p className="text-xs text-muted-foreground">
            Whisper medium 处理时间约为视频时长的 30–60%，请耐心等待...
          </p>
        </div>
      )}

      {/* Error */}
      {state.phase === "error" && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
      )}

      {/* Result */}
      {state.phase === "done" && (
        <Card className="border-green-500/40 bg-green-500/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-green-600 font-medium">
              <CheckCircle2 className="w-5 h-5" />
              转录完成
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(state.srtUrl, "_blank")}
              >
                <Download className="w-4 h-4 mr-2" />
                下载 .srt 字幕文件
              </Button>

              {state.burnedIn && state.videoUrl && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => window.open(state.videoUrl, "_blank")}
                >
                  <Download className="w-4 h-4 mr-2" />
                  下载带字幕视频
                </Button>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                Whisper medium
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {selectedLanguage === "auto" ? "自动语言" : LANGUAGE_OPTIONS.find(o => o.value === selectedLanguage)?.label}
              </Badge>
              {burnSubtitles && (
                <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-600">
                  硬字幕烧录
                </Badge>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={clearFile}
            >
              处理另一个视频
            </Button>
          </CardContent>
        </Card>
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
              <Captions className="w-4 h-4 mr-2" />
              开始转录
            </>
          )}
        </Button>
      )}
    </div>
  );
}
