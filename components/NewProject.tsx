import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Wand2,
  Video,
  Music,
  Type,
  Loader2,
  Sparkles,
  Link,
} from "lucide-react";
import { useTaskStore } from "@/lib/store";
import { useSettingsStore } from "@/lib/settings-store";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { StoryboardEditor } from "@/components/StoryboardEditor";
import {
  type TemplateType,
  type EditableScene,
  cloneTemplateScenesAsEditable,
} from "@/lib/storyboard-templates";

// ---------- Types ----------

type Mode = "generate" | "replicate";

interface NewProjectProps {
  setActiveTab: (tab: string) => void;
}

// ---------- Component ----------

export function NewProject({ setActiveTab }: NewProjectProps) {
  // Mode
  const [mode, setMode] = useState<Mode>("generate");
  const [platformUrl, setPlatformUrl] = useState("");

  // Content
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");

  // Visuals
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState([30]);

  // Audio
  const [voice, setVoice] = useState("alloy");
  const [bgm, setBgm] = useState("cinematic");

  // Storyboard editor state
  const [templateType, setTemplateType] = useState<TemplateType>("vlog");
  const [scenes, setScenes] = useState<EditableScene[]>(
    cloneTemplateScenesAsEditable("vlog")
  );

  const [isGenerating, setIsGenerating] = useState(false);

  const { addTask, language } = useTaskStore();
  const { llmConfigs, activeLlmId, pexelsApiKey } = useSettingsStore();

  // ---- Submit handler ----
  const handleGenerate = async () => {
    if (mode === "generate" && !topic.trim() && !script.trim()) {
      toast.error(t("newProject.enterTopicOrScript", language));
      return;
    }

    if (mode === "replicate" && !platformUrl.trim()) {
      toast.error(
        language === "en"
          ? "Please enter a platform video URL to replicate."
          : "请输入要复刻的平台视频链接"
      );
      return;
    }

    const activeLlm = llmConfigs.find((c) => c.id === activeLlmId);
    if (!activeLlm?.apiKey) {
      toast.error(
        language === "en"
          ? "Please configure and activate an AI model in Settings first."
          : "请先在设置中配置并激活一个大模型"
      );
      return;
    }

    setIsGenerating(true);

    try {
      const sceneHints = scenes.map((s) => s.label);

      const res = await fetch("/api/pipeline/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          platformUrl: platformUrl.trim(),
          topic: topic.trim(),
          script: script.trim(),
          duration: duration[0],
          aspectRatio,
          voice,
          bgm,
          llmBaseUrl: activeLlm.baseUrl,
          llmApiKey: activeLlm.apiKey,
          llmModel: activeLlm.model,
          pexelsApiKey,
          templateType,
          sceneCount: scenes.length,
          sceneHints,
          assets: [],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit pipeline");

      addTask({
        id: data.taskId,
        topic: topic || platformUrl || "Custom Script",
        status: "queued",
        progress: 0,
        createdAt: Date.now(),
        script,
        projectId: data.projectId,
        type: "pipeline",
      });

      toast.success(t("newProject.taskCreated", language));
      setActiveTab("tasks");
    } catch (error: any) {
      console.error("Pipeline submit error:", error);
      toast.error(error.message || t("newProject.scriptFailed", language));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("newProject.title", language)}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("newProject.desc", language)}
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setMode("generate")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${
            mode === "generate"
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          原创生成
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${mode === "generate" ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30" : ""}`}>
            大模型生成分镜
          </Badge>
        </button>
        <button
          type="button"
          onClick={() => setMode("replicate")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${
            mode === "replicate"
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Link className="w-4 h-4" />
          平台复刻
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${mode === "replicate" ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30" : ""}`}>
            解析同款视频
          </Badge>
        </button>
      </div>

      {/* Platform URL input (replicate mode only) */}
      {mode === "replicate" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-base">
              <Link className="w-4 h-4 mr-2" />
              视频链接
            </CardTitle>
            <CardDescription>
              填入抖音 / 小红书 / B站视频链接，系统将解析分镜和素材进行复刻
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="platform-url">平台视频 URL</Label>
              <Input
                id="platform-url"
                value={platformUrl}
                onChange={(e) => setPlatformUrl(e.target.value)}
                placeholder="https://www.douyin.com/video/... 或 https://www.bilibili.com/video/..."
              />
              <p className="text-xs text-muted-foreground">
                支持抖音、小红书、B站。需在设置中配置对应平台的 API Key。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Content input */}
          {mode === "generate" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Type className="w-5 h-5 mr-2" />{" "}
                  {t("newProject.content", language)}
                </CardTitle>
                <CardDescription>
                  {t("newProject.contentDesc", language)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="topic">{t("newProject.topic", language)}</Label>
                  <Input
                    id="topic"
                    placeholder={t("newProject.topicPlaceholder", language)}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      {t("newProject.orProvideScript", language)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="script">
                    {t("newProject.customScript", language)}
                  </Label>
                  <Textarea
                    id="script"
                    placeholder={t("newProject.scriptPlaceholder", language)}
                    className="min-h-[120px]"
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Visuals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Video className="w-5 h-5 mr-2" />{" "}
                {t("newProject.visuals", language)}
              </CardTitle>
              <CardDescription>
                {t("newProject.visualsDesc", language)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("newProject.aspectRatio", language)}</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select ratio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="9:16">
                        {t("newProject.portrait", language)}
                      </SelectItem>
                      <SelectItem value="16:9">
                        {t("newProject.landscape", language)}
                      </SelectItem>
                      <SelectItem value="1:1">
                        {t("newProject.square", language)}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    {t("newProject.targetDuration", language)}: {duration[0]}s
                  </Label>
                  <div className="pt-3">
                    <Slider
                      value={duration}
                      onValueChange={(val: number | readonly number[]) => {
                        if (typeof val === "number") setDuration([val]);
                        else setDuration([...val]);
                      }}
                      max={180}
                      min={15}
                      step={15}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Storyboard Editor */}
          <StoryboardEditor
            templateType={templateType}
            onTemplateChange={(type) => {
              setTemplateType(type);
              setScenes(cloneTemplateScenesAsEditable(type));
            }}
            scenes={scenes}
            onScenesChange={setScenes}
          />
        </div>

        {/* Right column */}
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Music className="w-5 h-5 mr-2" />{" "}
                {t("newProject.audio", language)}
              </CardTitle>
              <CardDescription>
                {t("newProject.audioDesc", language)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t("newProject.aiVoice", language)}</Label>
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alloy">{t("newProject.alloy", language)}</SelectItem>
                    <SelectItem value="echo">{t("newProject.echo", language)}</SelectItem>
                    <SelectItem value="fable">{t("newProject.fable", language)}</SelectItem>
                    <SelectItem value="nova">{t("newProject.nova", language)}</SelectItem>
                    <SelectItem value="shimmer">{t("newProject.shimmer", language)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("newProject.bgm", language)}</Label>
                <Select value={bgm} onValueChange={setBgm}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select BGM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("newProject.none", language)}</SelectItem>
                    <SelectItem value="cinematic">{t("newProject.cinematic", language)}</SelectItem>
                    <SelectItem value="lofi">{t("newProject.lofi", language)}</SelectItem>
                    <SelectItem value="upbeat">{t("newProject.upbeat", language)}</SelectItem>
                    <SelectItem value="ambient">{t("newProject.ambient", language)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Active model indicator */}
          {(() => {
            const activeLlm = llmConfigs.find((c) => c.id === activeLlmId);
            return activeLlm ? (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1">
                <p className="text-xs text-muted-foreground">当前使用模型</p>
                <p className="text-sm font-medium">{activeLlm.name}</p>
                <p className="text-xs text-muted-foreground truncate">{activeLlm.model}</p>
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-destructive/50 bg-destructive/5">
                <p className="text-xs text-destructive font-medium">未配置大模型</p>
                <p className="text-xs text-muted-foreground mt-0.5">请前往设置添加并激活一个大模型</p>
              </div>
            );
          })()}

          <Button
            size="lg"
            className="w-full h-14 text-lg"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Wand2 className="w-5 h-5 mr-2" />
            )}
            {isGenerating
              ? t("newProject.processing", language)
              : t("newProject.generateVideo", language)}
          </Button>
        </div>
      </div>
    </div>
  );
}
