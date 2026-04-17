import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Link,
  Music,
  X,
  Film,
  ImageIcon,
  Loader2,
  Wand2,
  Settings2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useTaskStore, useDraftStore } from "@/lib/store";
import { useSettingsStore } from "@/lib/settings-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ types ---

interface NewProjectProps {
  setActiveTab: (tab: string) => void;
}

// ---------------------------------------------------------------- helpers ---

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(file: File) {
  if (file.type.startsWith("video/")) return <Film className="w-4 h-4 shrink-0 text-blue-500" />;
  return <ImageIcon className="w-4 h-4 shrink-0 text-emerald-500" />;
}

// --------------------------------------------------------------- pill btn ---

interface PillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}
function Pill({ label, active, onClick }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- component -

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const;
const DURATIONS = [
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "3min", value: 180 },
] as const;

const TEMPLATES = [
  { id: "vlog", label: "Vlog" },
  { id: "product", label: "产品展示" },
  { id: "knowledge", label: "知识科普" },
  { id: "travel", label: "旅行记录" },
  { id: "food", label: "美食探店" },
  { id: "sports", label: "运动健身" },
] as const;

// Multi-API Provider Configuration
const API_PROVIDERS = [
  {
    id: "zhipu",
    name: "智谱 AI",
    nameEn: "Zhipu AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    color: "bg-blue-500",
    description: "国产大模型，免费额度充足",
    icon: "🧠",
  },
  {
    id: "doubao",
    name: "豆包",
    nameEn: "Doubao (ByteDance)",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-pro-32k",
    color: "bg-orange-500",
    description: "字节跳动出品，性价比高",
    icon: "🫘",
  },
  {
    id: "openai",
    name: "OpenAI",
    nameEn: "OpenAI GPT",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    color: "bg-green-500",
    description: "业界标杆，效果稳定",
    icon: "🤖",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    nameEn: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    color: "bg-purple-500",
    description: "开源模型，代码能力强",
    icon: "🔍",
  },
  {
    id: "qianwen",
    name: "通义千问",
    nameEn: "Qwen (Alibaba)",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-turbo",
    color: "bg-cyan-500",
    description: "阿里云大模型，中文优化好",
    icon: "💬",
  },
  {
    id: "custom",
    name: "自定义 API",
    nameEn: "Custom API",
    baseUrl: "",
    model: "",
    color: "bg-gray-500",
    description: "兼容OpenAI格式的任意API",
    icon: "⚙️",
  },
] as const;

export function NewProject({ setActiveTab }: NewProjectProps) {
  // ---- Draft store (persisted across page switches) ----
  const draft = useDraftStore();

  // ---- Material sources (File objects are local-only, metas are persisted) ----
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // ---- Config (synced to draft store) ----
  const [referenceUrl, setReferenceUrl] = useState<string>(draft.referenceUrl);
  const [aspectRatio, setAspectRatio] = useState<string>(draft.aspectRatio);
  const [duration, setDuration] = useState<number>(draft.duration);
  const [template, setTemplate] = useState<string>(draft.template);

  // ---- API Configuration (synced to draft store) ----
  const [selectedProvider, setSelectedProvider] = useState<string>(draft.selectedProvider);
  const [apiKey, setApiKey] = useState<string>(draft.apiKey);
  const [customBaseUrl, setCustomBaseUrl] = useState<string>(draft.customBaseUrl);
  const [customModel, setCustomModel] = useState<string>(draft.customModel);
  const [showApiConfig, setShowApiConfig] = useState<boolean>(false);
  const [apiTestStatus, setApiTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [apiTestMessage, setApiTestMessage] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const { addTask } = useTaskStore();

  // Get current provider config
  const currentProvider = API_PROVIDERS.find((p) => p.id === selectedProvider);
  const effectiveBaseUrl = selectedProvider === "custom" ? customBaseUrl : currentProvider?.baseUrl || "";
  const effectiveModel = selectedProvider === "custom" ? customModel : currentProvider?.model || "";

  // ---- Sync config changes to draft store (using useEffect to avoid setState during render) ----
  useEffect(() => {
    draft.setReferenceUrl(referenceUrl);
    draft.setAspectRatio(aspectRatio);
    draft.setDuration(duration);
    draft.setTemplate(template);
    draft.setSelectedProvider(selectedProvider);
    draft.setApiKey(apiKey);
    draft.setCustomBaseUrl(customBaseUrl);
    draft.setCustomModel(customModel);
  }, [referenceUrl, aspectRatio, duration, template, selectedProvider, apiKey, customBaseUrl, customModel]);

  // ---- File handlers ----

  const handleMediaFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter(
      (f) => f.type.startsWith("video/") || f.type.startsWith("image/")
    );
    setMediaFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const merged = [...prev, ...arr.filter((f) => !existingNames.has(f.name))];
      // Persist metadata to draft store
      draft.setMediaFileMetas(merged.map((f) => ({ name: f.name, size: f.size, type: f.type })));
      return merged;
    });
  };

  const removeMedia = (name: string) =>
    setMediaFiles((prev) => {
      const next = prev.filter((f) => f.name !== name);
      draft.setMediaFileMetas(next.map((f) => ({ name: f.name, size: f.size, type: f.type })));
      return next;
    });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleMediaFiles(e.dataTransfer.files);
  };

  // ---- API Test ----

  const testApiConnection = async () => {
    if (!apiKey.trim()) {
      toast.error("请先输入 API Key");
      return;
    }

    if (selectedProvider === "custom" && !customBaseUrl.trim()) {
      toast.error("自定义API需要填写 Base URL");
      return;
    }

    setApiTestStatus("testing");
    setApiTestMessage("正在测试连接...");

    try {
      const testRes = await fetch("/api/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: effectiveBaseUrl,
          apiKey: apiKey.trim(),
          model: effectiveModel,
        }),
      });

      // Defensive: handle empty body
      const rawText = await testRes.text();
      if (!rawText) {
        setApiTestStatus("error");
        setApiTestMessage("服务器返回空响应，请检查后端是否运行");
        toast.error("服务器返回空响应");
        return;
      }

      let testData: any;
      try {
        testData = JSON.parse(rawText);
      } catch {
        setApiTestStatus("error");
        setApiTestMessage("服务器返回无效响应");
        toast.error("服务器返回无效响应，请查看控制台");
        return;
      }

      if (testRes.ok && testData.success) {
        setApiTestStatus("success");
        setApiTestMessage(`连接成功！模型: ${testData.model || effectiveModel}`);
        toast.success("API 连接测试成功！");
      } else {
        setApiTestStatus("error");
        setApiTestMessage(testData.error || "连接失败");
        toast.error(testData.error || "API 连接测试失败");
      }
    } catch (err: any) {
      setApiTestStatus("error");
      setApiTestMessage(err.message || "网络错误");
      toast.error(err.message || "网络错误，请检查连接");
    }
  };

  // ---- Submit ----

  const handleSubmit = async () => {
    if (mediaFiles.length === 0 && !referenceUrl.trim()) {
      toast.error("请至少上传素材文件或填写参考链接");
      return;
    }

    if (!apiKey.trim()) {
      toast.error("请配置 API 密钥");
      setShowApiConfig(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      mediaFiles.forEach((f) => fd.append("videos", f));
      if (audioFile) fd.append("audio", audioFile);
      fd.append("url", referenceUrl.trim());
      fd.append("aspectRatio", aspectRatio);
      fd.append("duration", String(duration));
      fd.append("template", template);

      // Add LLM configuration
      fd.append("llmBaseUrl", effectiveBaseUrl);
      fd.append("llmApiKey", apiKey.trim());
      fd.append("llmModel", effectiveModel);

      console.log("[Submit] Sending request to /api/auto-edit...");
      console.log("[Submit] LLM Config:", { provider: selectedProvider, baseUrl: effectiveBaseUrl, model: effectiveModel });

      const res = await fetch("/api/auto-edit", { method: "POST", body: fd });

      console.log("[Submit] Response status:", res.status);
      console.log("[Submit] Response OK:", res.ok);

      // Enhanced error handling for JSON parsing
      let data;
      try {
        const responseText = await res.text();
        console.log("[Submit] Response body:", responseText);

        if (!responseText) {
          throw new Error("服务器返回了空响应，请检查后端日志");
        }

        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error("[Submit] JSON Parse Error:", parseError);
          console.error("[Submit] Raw Response:", responseText.substring(0, 500));
          throw new Error(
            `服务器返回了无效的JSON格式。` +
            `\n原始响应: ${responseText.substring(0, 200)}...` +
            `\n\n这通常意味着后端处理过程中出现了错误。请查看终端/控制台中的错误信息。`
          );
        }

        if (!res.ok) {
          throw new Error(data.error || `服务器错误 (${res.status})`);
        }
      } catch (err: any) {
        if (err.message.includes("JSON") || err.message.includes("空响应")) {
          toast.error(err.message, {
            duration: 10000,
            action: {
              label: "查看详情",
              onClick: () => console.log("[Submit] Full error:", err),
            },
          });
        } else {
          throw err;
        }
        return; // Don't continue on JSON errors
      }

      const templateLabel =
        TEMPLATES.find((t) => t.id === template)?.label ?? template;
      const topicLabel =
        mediaFiles.length > 0
          ? `${templateLabel} · ${mediaFiles.length} 个素材`
          : `${templateLabel} · ${referenceUrl}`;

      addTask({
        id: data.taskId,
        topic: topicLabel,
        status: "queued",
        progress: 0,
        createdAt: Date.now(),
        type: "auto_edit",
      });

      toast.success("任务已提交，正在智能剪辑...");
      draft.clearDraft();
      setActiveTab("tasks");
    } catch (err: any) {
      console.error("[Submit] Error:", err);
      toast.error(err.message || "提交失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasInput = mediaFiles.length > 0 || referenceUrl.trim().length > 0;
  const isApiConfigured = apiKey.trim().length > 0;

  // ----------------------------------------------------------------- render -

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wand2 className="w-7 h-7 text-primary" />
          智能成片
        </h1>
        <p className="text-muted-foreground mt-2">
          上传素材，AI 自动分析节拍与画面，生成带分层轨道的草稿文件
        </p>
      </div>

      {/* ---- Area A: Material Sources ---- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* 批量传素材 */}
        <Card
          className={cn(
            "border-2 border-dashed cursor-pointer transition-colors hover:border-primary/60",
            mediaFiles.length > 0 && "border-primary/40 bg-primary/5"
          )}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => mediaInputRef.current?.click()}
        >
          <CardContent className="p-4 flex flex-col items-center text-center gap-2 min-h-[120px] justify-center">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="font-medium text-sm">批量传素材</p>
            <p className="text-xs text-muted-foreground">
              视频 / 图片，支持多选或拖拽
            </p>
            {mediaFiles.length > 0 && (
              <Badge variant="secondary" className="mt-1">
                已选 {mediaFiles.length} 个
              </Badge>
            )}
          </CardContent>
        </Card>
        <input
          ref={mediaInputRef}
          type="file"
          multiple
          accept="video/*,image/*"
          className="hidden"
          onChange={(e) => handleMediaFiles(e.target.files)}
        />

        {/* 输链接 */}
        <Card className="border-2 border-dashed">
          <CardContent className="p-4 flex flex-col gap-3 min-h-[120px] justify-center">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link className="w-5 h-5 text-muted-foreground" />
              输链接
            </div>
            <Input
              placeholder="YouTube / Bilibili / 抖音"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <p className="text-xs text-muted-foreground">可选，作为参考素材源</p>
          </CardContent>
        </Card>

        {/* 传音频 */}
        <Card
          className={cn(
            "border-2 border-dashed cursor-pointer transition-colors hover:border-primary/60",
            audioFile && "border-primary/40 bg-primary/5"
          )}
          onClick={() => audioInputRef.current?.click()}
        >
          <CardContent className="p-4 flex flex-col items-center text-center gap-2 min-h-[120px] justify-center">
            <Music className="w-8 h-8 text-muted-foreground" />
            <p className="font-medium text-sm">传音频</p>
            <p className="text-xs text-muted-foreground">BGM 节拍分析（可选）</p>
            {audioFile && (
              <Badge variant="secondary" className="mt-1 max-w-full truncate">
                {audioFile.name}
              </Badge>
            )}
          </CardContent>
        </Card>
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setAudioFile(f);
              draft.setAudioFileName(f.name);
            }
          }}
        />
      </div>

      {/* Selected media file list */}
      {mediaFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            已选素材（{mediaFiles.length} 个）
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {mediaFiles.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border text-sm"
              >
                {fileIcon(f)}
                <span className="flex-1 truncate text-xs">{f.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatBytes(f.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeMedia(f.name)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Restore hint: files were lost after page switch but metadata survives */}
      {mediaFiles.length === 0 && draft.mediaFileMetas.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-300">
            上次选择过 {draft.mediaFileMetas.length} 个素材文件
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            由于浏览器限制，文件需重新选择。上次文件：
            {draft.mediaFileMetas.map((m) => m.name).join("、")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => mediaInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-2" />
            重新选择素材
          </Button>
        </div>
      )}

      {/* Audio chip */}
      {audioFile && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border text-sm w-fit">
          <Music className="w-4 h-4 text-violet-500" />
          <span className="text-xs max-w-[240px] truncate">{audioFile.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatBytes(audioFile.size)}
          </span>
          <button
            type="button"
            onClick={() => {
              setAudioFile(null);
              draft.setAudioFileName(null);
              if (audioInputRef.current) audioInputRef.current.value = "";
            }}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ---- Area B: Quick Config ---- */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium w-16 shrink-0">画面比例</span>
          {ASPECT_RATIOS.map((r) => (
            <Pill
              key={r}
              label={r}
              active={aspectRatio === r}
              onClick={() => setAspectRatio(r)}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium w-16 shrink-0">目标时长</span>
          {DURATIONS.map((d) => (
            <Pill
              key={d.value}
              label={d.label}
              active={duration === d.value}
              onClick={() => setDuration(d.value)}
            />
          ))}
        </div>
      </div>

      {/* ---- Area C: Template Tags ---- */}
      <div className="space-y-3">
        <p className="text-sm font-medium">成片模板</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setTemplate(tpl.id)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium border transition-all",
                template === tpl.id
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {tpl.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Area D: API Configuration ---- */}
      <Card className={cn(
        "transition-all duration-300",
        showApiConfig ? "ring-2 ring-primary/30" : ""
      )}>
        <CardContent className="p-6 space-y-4">
          {/* Header with toggle */}
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowApiConfig(!showApiConfig)}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              <span className="font-medium">AI 模型配置</span>
              {isApiConfigured && (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
              {!isApiConfigured && (
                <AlertCircle className="w-4 h-4 text-destructive" />
              )}
            </div>
            <Button variant="ghost" size="sm">
              {showApiConfig ? "收起" : "展开"}
            </Button>
          </div>

          {showApiConfig && (
            <div className="space-y-4 pt-4 border-t">
              {/* Provider Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">选择 API 提供商</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {API_PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => {
                        setSelectedProvider(provider.id);
                        setApiTestStatus("idle");
                        setApiTestMessage("");
                        // Clear custom fields when switching away from custom
                        if (provider.id !== "custom") {
                          setCustomBaseUrl("");
                          setCustomModel("");
                        }
                      }}
                      className={cn(
                        "px-3 py-2 rounded-lg border text-left transition-all text-sm",
                        selectedProvider === provider.id
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{provider.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs">{provider.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {provider.model || "自定义"}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {currentProvider && (
                  <p className="text-xs text-muted-foreground">
                    💡 {currentProvider.description}
                  </p>
                )}
              </div>

              {/* Custom API Fields (only for "custom" provider) */}
              {selectedProvider === "custom" && (
                <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
                  <div className="space-y-2">
                    <Label htmlFor="custom-base-url" className="text-xs">Base URL</Label>
                    <Input
                      id="custom-base-url"
                      placeholder="https://api.example.com/v1"
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-model" className="text-xs">模型名称</Label>
                    <Input
                      id="custom-model"
                      placeholder="gpt-4o-mini"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* API Key Input */}
              <div className="space-y-2">
                <Label htmlFor="api-key" className="text-sm font-medium">
                  API 密钥
                  {effectiveBaseUrl && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({currentProvider?.name})
                    </span>
                  )}
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder={`输入 ${currentProvider?.name || "API"} 的密钥`}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setApiTestStatus("idle");
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  🔒 密钥仅用于本次请求，不会存储到服务器
                </p>
              </div>

              {/* Current Configuration Summary */}
              {(effectiveBaseUrl || effectiveModel) && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                    当前配置：
                  </p>
                  <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1 font-mono">
                    {effectiveBaseUrl && (
                      <div>📡 Base URL: {effectiveBaseUrl}</div>
                    )}
                    {effectiveModel && (
                      <div>🤖 Model: {effectiveModel}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Test Connection Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={testApiConnection}
                disabled={!apiKey.trim() || apiTestStatus === "testing"}
                className="w-full"
              >
                {apiTestStatus === "testing" ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    测试中...
                  </>
                ) : (
                  <>
                    🧪 测试连接
                  </>
                )}
              </Button>

              {/* Test Result */}
              {apiTestMessage && (
                <div className={cn(
                  "text-xs p-2 rounded-md",
                  apiTestStatus === "success"
                    ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                )}>
                  {apiTestMessage}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Submit ---- */}
      <Button
        size="lg"
        className="w-full"
        disabled={!hasInput || isSubmitting || !isApiConfigured}
        onClick={handleSubmit}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            正在提交...
          </>
        ) : (
          <>
            <Wand2 className="w-5 h-5 mr-2" />
            一键成片
            {!isApiConfigured && " (需先配置API)"}
          </>
        )}
      </Button>

      {!isApiConfigured && (
        <p className="text-xs text-center text-muted-foreground">
          请先点击上方 "AI 模型配置" 设置 API 密钥
        </p>
      )}
    </div>
  );
}
