import { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileAudio,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Music2,
  Copy,
  Check,
  Zap,
  ChevronDown,
  ChevronRight,
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

interface BeatSection {
  start: number;
  end: number;
  energy: "high" | "low";
  label: string;
}

interface BeatReport {
  tempo: number;
  duration: number;
  beat_times: number[];
  strong_beats: number[];
  onset_times: number[];
  sections: BeatSection[];
  cut_points: number[];
  avg_beat_interval: number;
  total_beats: number;
  every_n_beats: number;
}

type FileTaskState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "polling"; taskId: string; progress: number }
  | { phase: "done"; report: BeatReport }
  | { phase: "error"; message: string };

interface FileEntry {
  id: string;
  file: File;
  state: FileTaskState;
  copied: boolean;
}

const ACCEPTED_TYPES = ".mp3,.wav,.m4a,.flac,.aac,.ogg";
const MAX_FILE_MB = 50;

const BEAT_INTERVAL_OPTIONS = [
  { value: "1", label: "每 1 拍（超快节奏切换）" },
  { value: "2", label: "每 2 拍（标准卡点）— 推荐" },
  { value: "4", label: "每 4 拍（慢节奏 / 电影感）" },
];

const SECTION_COLOR: Record<string, string> = {
  intro:  "bg-blue-500/30",
  verse:  "bg-indigo-500/30",
  chorus: "bg-pink-500/40",
  drop:   "bg-red-500/40",
  bridge: "bg-amber-500/30",
  outro:  "bg-zinc-500/30",
};

const ENERGY_BADGE: Record<string, string> = {
  high: "bg-rose-500/20 text-rose-600 border-rose-300",
  low:  "bg-sky-500/20  text-sky-600  border-sky-300",
};

// --------------------------------------------------------------------------
// Helper
// --------------------------------------------------------------------------

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

// --------------------------------------------------------------------------
// Sub-component: BeatReportView
// --------------------------------------------------------------------------

function BeatReportView({
  report,
  onCopy,
  copied,
}: {
  report: BeatReport;
  onCopy: () => void;
  copied: boolean;
}) {
  const beatSetS = new Set(report.strong_beats.map((t) => t.toFixed(4)));

  return (
    <div className="space-y-4 pt-2">
      {/* Top metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "BPM", value: `${report.tempo.toFixed(1)}` },
          { label: "时长", value: formatTime(report.duration) },
          { label: "总节拍数", value: String(report.total_beats) },
          { label: "切点数", value: String(report.cut_points.length) },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-zinc-900 border-zinc-700">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xs text-zinc-400 mb-1">{label}</p>
              <p className="text-xl font-bold text-white">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Beat timeline */}
      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-xs font-medium text-zinc-300">
            节拍时间轴
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          {/* Section background bar */}
          <div className="relative h-8 flex rounded-md overflow-hidden mb-2">
            {report.sections.map((sec, i) => {
              const widthPct = ((sec.end - sec.start) / report.duration) * 100;
              return (
                <div
                  key={i}
                  className={`${SECTION_COLOR[sec.label] ?? "bg-zinc-700/30"} flex items-center justify-center`}
                  style={{ width: `${widthPct}%` }}
                  title={`${sec.label} (${sec.energy})`}
                >
                  <span className="text-[8px] text-white/70 truncate px-0.5 select-none">
                    {sec.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Beat marker bar */}
          <div className="relative h-5 bg-zinc-950 rounded overflow-hidden">
            {report.beat_times.map((t, i) => {
              const leftPct = (t / report.duration) * 100;
              const strong = beatSetS.has(t.toFixed(4));
              return (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 w-px ${strong ? "bg-pink-400" : "bg-zinc-600"}`}
                  style={{ left: `${leftPct}%` }}
                  title={`${formatTime(t)}${strong ? " ★" : ""}`}
                />
              );
            })}
            {report.cut_points.map((t, i) => {
              const leftPct = (t / report.duration) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/70"
                  style={{ left: `${leftPct}%` }}
                  title={`切点 ${formatTime(t)}`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-2 text-xs text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 bg-pink-400 rounded-sm" /> 强拍
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 bg-zinc-600 rounded-sm" /> 弱拍
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 bg-yellow-400/70 rounded-sm" /> 切点
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sections list */}
      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-xs font-medium text-zinc-300">
            段落分析（共 {report.sections.length} 段）
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="space-y-1.5">
            {report.sections.map((sec, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs rounded-md px-3 py-1.5 bg-zinc-950"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      SECTION_COLOR[sec.label] ?? "bg-zinc-500"
                    }`}
                  />
                  <span className="capitalize text-zinc-200 font-medium">{sec.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-mono">
                    {formatTime(sec.start)} → {formatTime(sec.end)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] py-0 ${ENERGY_BADGE[sec.energy]}`}
                  >
                    {sec.energy === "high" ? "高能量" : "低能量"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cut points grid */}
      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader className="pb-2 pt-3">
          <CardTitle className="text-xs font-medium text-zinc-300 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            推荐切点（每 {report.every_n_beats} 拍，共 {report.cut_points.length} 个）
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="flex flex-wrap gap-1">
            {report.cut_points.slice(0, 40).map((t, i) => (
              <Badge
                key={i}
                variant="outline"
                className="font-mono text-[10px] bg-yellow-400/10 text-yellow-300 border-yellow-400/30 py-0"
              >
                {formatTime(t)}
              </Badge>
            ))}
            {report.cut_points.length > 40 && (
              <Badge variant="outline" className="text-[10px] text-zinc-400 py-0">
                +{report.cut_points.length - 40} 更多
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Copy JSON */}
      <Button
        variant="outline"
        size="sm"
        className="w-full border-zinc-700 text-zinc-300"
        onClick={onCopy}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 mr-2 text-green-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 mr-2" />
        )}
        {copied ? "已复制 JSON" : "复制 JSON"}
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Sub-component: ResultCard (collapsible per-file result)
// --------------------------------------------------------------------------

function ResultCard({
  entry,
  defaultOpen,
  onCopy,
}: {
  entry: FileEntry;
  defaultOpen: boolean;
  onCopy: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (entry.state.phase !== "done") return null;
  const { report } = entry.state;

  return (
    <Card className="bg-zinc-800 border-zinc-700">
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-700/30 transition-colors rounded-t-lg"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
        )}
        <FileAudio className="w-4 h-4 text-pink-400 shrink-0" />
        <span className="flex-1 text-sm font-medium text-white text-left truncate">
          {entry.file.name}
        </span>
        <span className="text-sm font-bold text-pink-300 shrink-0">
          {report.tempo.toFixed(1)} BPM
        </span>
        <span className="text-xs text-zinc-400 shrink-0 ml-2">
          {formatTime(report.duration)}
        </span>
      </button>

      {open && (
        <CardContent className="px-4 pb-4">
          <BeatReportView
            report={report}
            onCopy={() => onCopy(entry.id)}
            copied={entry.copied}
          />
        </CardContent>
      )}
    </Card>
  );
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

export function BeatSync() {
  const { language } = useTaskStore();

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [everyNBeats, setEveryNBeats] = useState("2");
  const [latestDoneId, setLatestDoneId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ---- Entry helpers ----

  const updateEntry = (id: string, patch: Partial<FileEntry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
    );
  };

  const updateEntryState = (id: string, state: FileTaskState) => {
    updateEntry(id, { state });
  };

  // ---- File handling ----

  const handleFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) => {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name} 超过 ${MAX_FILE_MB}MB 限制`);
        return false;
      }
      return true;
    });

    setEntries((prev) => {
      const deduped = valid.filter(
        (f) => !prev.some((e) => e.file.name === f.name && e.file.size === f.size)
      );
      if (deduped.length < valid.length) {
        toast.info("已跳过重复文件");
      }
      const newEntries: FileEntry[] = deduped.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        state: { phase: "idle" },
        copied: false,
      }));
      return [...prev, ...newEntries];
    });
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) handleFiles(files);
    // reset input so same file can be re-added after removal
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFiles(files);
  };

  const clearEntry = (id: string) => {
    stopPollingForEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (latestDoneId === id) setLatestDoneId(null);
  };

  // ---- Polling ----

  const stopPollingForEntry = (id: string) => {
    const t = pollTimers.current.get(id);
    if (t) {
      clearInterval(t);
      pollTimers.current.delete(id);
    }
  };

  const startPollingForEntry = (entryId: string, taskId: string) => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (!res.ok) return;
        const data = await res.json();
        const progress = data.progress ?? 0;

        if (data.status === "completed") {
          stopPollingForEntry(entryId);
          let report: BeatReport | null = null;
          if (data.result_json) {
            try { report = JSON.parse(data.result_json); } catch {}
          }
          if (!report) {
            updateEntryState(entryId, { phase: "error", message: "报告解析失败" });
            toast.error("分析完成但报告解析失败");
            return;
          }
          updateEntryState(entryId, { phase: "done", report });
          setLatestDoneId(entryId);
          toast.success("节拍分析完成！");
        } else if (data.status === "failed") {
          stopPollingForEntry(entryId);
          updateEntryState(entryId, { phase: "error", message: data.error || "分析失败" });
          toast.error("分析失败：" + (data.error || "未知错误"));
        } else {
          updateEntryState(entryId, { phase: "polling", taskId, progress });
        }
      } catch {
        // transient error — keep polling
      }
    }, 2500);
    pollTimers.current.set(entryId, timer);
  };

  // ---- Submit ----

  const handleSubmitOne = async (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.state.phase !== "idle") return;

    updateEntryState(entryId, { phase: "uploading" });

    try {
      const form = new FormData();
      form.append("audio", entry.file);
      form.append("everyNBeats", everyNBeats);

      const res = await fetch("/api/beat-analyze", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const { taskId } = await res.json();
      updateEntryState(entryId, { phase: "polling", taskId, progress: 0 });
      startPollingForEntry(entryId, taskId);
    } catch (err) {
      updateEntryState(entryId, { phase: "error", message: String(err) });
      toast.error(`${entry.file.name} 提交失败：${String(err)}`);
    }
  };

  const handleSubmitAll = () => {
    entries
      .filter((e) => e.state.phase === "idle")
      .forEach((e) => handleSubmitOne(e.id));
    if (entries.filter((e) => e.state.phase === "idle").length > 0) {
      toast.info("已提交所有音频，并行分析中…");
    }
  };

  // ---- Copy JSON ----

  const handleCopy = (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.state.phase !== "done") return;
    navigator.clipboard.writeText(JSON.stringify(entry.state.report, null, 2));
    updateEntry(entryId, { copied: true });
    setTimeout(() => updateEntry(entryId, { copied: false }), 2000);
  };

  // ---- Derived state ----

  const idleCount = entries.filter((e) => e.state.phase === "idle").length;
  const hasActive = entries.some(
    (e) => e.state.phase === "uploading" || e.state.phase === "polling"
  );
  const doneEntries = entries.filter((e) => e.state.phase === "done");

  // ---- Render ----

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
          <Music2 className="w-5 h-5 text-pink-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">节拍分析</h1>
          <p className="text-sm text-zinc-400">
            上传一个或多个 BGM，librosa 并行提取节拍 / 重音 / 段落，生成精准切点时间表
          </p>
        </div>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Upload zone — always visible */}
      <div>
        <Label className="text-zinc-300 mb-2 block">
          音频文件
          {entries.length > 0 && (
            <span className="ml-2 text-xs text-zinc-500">
              已选 {entries.length} 个
            </span>
          )}
        </Label>
        <div
          className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer
            ${dragOver ? "border-pink-400 bg-pink-500/5" : "border-zinc-700 hover:border-zinc-500"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={onInputChange}
          />
          <div className="flex flex-col items-center gap-2 py-7 text-zinc-400">
            <Upload className="w-7 h-7" />
            <p className="text-sm">拖拽音频文件至此，或点击选择（可多选）</p>
            <p className="text-xs">支持 MP3 / WAV / M4A / FLAC / AAC（单文件最大 {MAX_FILE_MB}MB）</p>
          </div>
        </div>
      </div>

      {/* File list */}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5"
            >
              {/* Icon */}
              <div className="w-8 h-8 rounded bg-pink-500/15 flex items-center justify-center shrink-0">
                <FileAudio className="w-4 h-4 text-pink-400" />
              </div>

              {/* Name + size */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{entry.file.name}</p>
                <p className="text-xs text-zinc-500">
                  {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>

              {/* Status indicator */}
              <div className="shrink-0 w-28 flex items-center justify-end gap-1.5">
                {entry.state.phase === "idle" && (
                  <span className="text-xs text-zinc-500">待分析</span>
                )}
                {entry.state.phase === "uploading" && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                    <span className="text-xs text-zinc-400">上传中…</span>
                  </>
                )}
                {entry.state.phase === "polling" && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-pink-400" />
                    <span className="text-xs text-pink-300">{entry.state.progress}%</span>
                  </>
                )}
                {entry.state.phase === "done" && (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-xs text-green-400">{entry.state.report.tempo.toFixed(0)} BPM</span>
                  </>
                )}
                {entry.state.phase === "error" && (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs text-red-400 truncate max-w-[80px]" title={entry.state.message}>
                      失败
                    </span>
                  </>
                )}
              </div>

              {/* Remove */}
              <button
                className="p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                onClick={() => clearEntry(entry.id)}
                title="移除"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Options + Submit */}
      {entries.length > 0 && (
        <div className="space-y-4">
          <div>
            <Label className="text-zinc-300 mb-2 block">切点密度</Label>
            <Select value={everyNBeats} onValueChange={setEveryNBeats} disabled={hasActive}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {BEAT_INTERVAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-zinc-200">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full bg-pink-600 hover:bg-pink-700 text-white"
            disabled={idleCount === 0 || hasActive}
            onClick={handleSubmitAll}
          >
            {hasActive ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                分析中…
              </>
            ) : (
              <>
                <Music2 className="w-4 h-4 mr-2" />
                开始分析
                {idleCount > 0 && ` (${idleCount} 个)`}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Results — one collapsible card per completed entry */}
      {doneEntries.length > 0 && (
        <div className="space-y-3">
          <Separator className="bg-zinc-800" />
          <p className="text-sm font-medium text-zinc-300">
            分析结果（{doneEntries.length} 个）
          </p>
          {doneEntries.map((entry) => (
            <ResultCard
              key={entry.id}
              entry={entry}
              defaultOpen={entry.id === latestDoneId}
              onCopy={handleCopy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
