import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Play,
  Download,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wand2,
  FileJson,
} from "lucide-react";
import { useTaskStore, TaskStatus } from "@/lib/store";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { t } from "@/lib/i18n";

const statusConfig: Record<TaskStatus, { color: string; icon: any; phaseLabel?: string }> = {
  pending: { color: "bg-zinc-500", icon: Clock },
  queued: { color: "bg-zinc-400", icon: Clock },
  generating_script: { color: "bg-blue-500", icon: Loader2 },
  generating_audio: { color: "bg-indigo-500", icon: Loader2 },
  gathering_visuals: { color: "bg-purple-500", icon: Loader2 },
  rendering: { color: "bg-orange-500", icon: Loader2 },
  analyzing: { color: "bg-cyan-500", icon: Loader2 },
  crawling: { color: "bg-teal-500", icon: Loader2 },
  pipeline_analyzing: { color: "bg-blue-500", icon: Loader2, phaseLabel: "AI 正在分析主题..." },
  pipeline_fetching: { color: "bg-purple-500", icon: Loader2, phaseLabel: "正在搜索素材..." },
  pipeline_rendering: { color: "bg-orange-500", icon: Loader2, phaseLabel: "FFmpeg 渲染中..." },
  transcribing: { color: "bg-cyan-500", icon: Loader2, phaseLabel: "Whisper 转录中..." },
  video_analyzing: { color: "bg-emerald-500", icon: Loader2, phaseLabel: "OpenCV 分析中..." },
  beat_analyzing:  { color: "bg-pink-500",    icon: Loader2, phaseLabel: "librosa 节拍分析中..." },
  auto_editing:    { color: "bg-violet-500",  icon: Wand2,   phaseLabel: "智能剪辑中..." },
  completed: { color: "bg-green-500", icon: CheckCircle2 },
  failed: { color: "bg-red-500", icon: AlertCircle },
};

export function TaskList() {
  const { tasks, removeTask, language, fetchTasks, pollTaskStatus } = useTaskStore();
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch tasks from backend on mount
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Poll active tasks every 3 seconds
  useEffect(() => {
    const activeTasks = tasks.filter(
      (t) => !['completed', 'failed'].includes(t.status) && t.status !== 'pending'
    );
    if (activeTasks.length > 0) {
      pollRef.current = setInterval(() => {
        activeTasks.forEach((task) => pollTaskStatus(task.id));
      }, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tasks, pollTaskStatus]);

  if (tasks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <div className="w-24 h-24 mb-6 rounded-full bg-muted flex items-center justify-center">
          <Play className="w-10 h-10 opacity-50" />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-foreground">
          {t("taskList.noTasks", language)}
        </h2>
        <p>{t("taskList.createToStart", language)}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("taskList.title", language)}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("taskList.desc", language)}
        </p>
      </div>

      <div className="space-y-4">
        {tasks.map((task) => {
          const config = statusConfig[task.status];
          const StatusIcon = config.icon;
          const isProcessing = !["completed", "failed", "pending"].includes(
            task.status,
          );
          const statusLabel = t(`taskList.status.${task.status}`, language);

          return (
            <Card key={task.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row">
                  {/* Thumbnail Placeholder */}
                  <div className="w-full md:w-48 h-32 bg-muted flex items-center justify-center border-r relative group">
                    {task.status === "completed" ? (
                      <>
                        <img
                          src={`https://picsum.photos/seed/${task.id}/400/300`}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="rounded-full w-12 h-12"
                          >
                            <Play className="w-6 h-6 ml-1" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-muted-foreground flex flex-col items-center">
                        <StatusIcon
                          className={`w-8 h-8 mb-2 ${isProcessing ? "animate-spin" : ""}`}
                        />
                        <span className="text-xs font-medium uppercase tracking-wider">
                          {statusLabel}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 p-6 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg line-clamp-1">
                          {task.topic}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t("taskList.created", language)}{" "}
                          {formatDistanceToNow(task.createdAt, {
                            addSuffix: true,
                            locale: language === "zh" ? zhCN : undefined,
                          })}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`${config.color} text-white border-none`}
                      >
                        {statusLabel}
                      </Badge>
                    </div>

                    {isProcessing && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{config.phaseLabel || t("taskList.progress", language)}</span>
                          <span>{task.progress}%</span>
                        </div>
                        <Progress value={task.progress} className="h-2" />
                      </div>
                    )}

                    {!isProcessing && (
                      <div className="flex justify-end space-x-2 mt-4">
                        {task.status === "completed" && task.resultUrl && task.type === "auto_edit" && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => window.open(task.resultUrl, "_blank")}
                          >
                            <FileJson className="w-4 h-4 mr-2" />
                            下载草稿 JSON
                          </Button>
                        )}
                        {task.status === "completed" && task.resultUrl && task.type !== "auto_edit" && (
                          <Button variant="outline" size="sm" onClick={() => window.open(task.resultUrl, '_blank')}>
                            <Download className="w-4 h-4 mr-2" />{" "}
                            {t("taskList.download", language)}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeTask(task.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />{" "}
                          {t("taskList.delete", language)}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
