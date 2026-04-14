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
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Wand2,
  Play,
  Video,
  Music,
  Type,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { useTaskStore } from "@/lib/store";
import { toast } from "sonner";
import { GoogleGenAI } from "@google/genai";
import { t } from "@/lib/i18n";

interface NewProjectProps {
  setActiveTab: (tab: string) => void;
}

export function NewProject({ setActiveTab }: NewProjectProps) {
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [voice, setVoice] = useState("alloy");
  const [bgm, setBgm] = useState("cinematic");
  const [duration, setDuration] = useState([30]);
  const [useAiVisuals, setUseAiVisuals] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const { addTask, language } = useTaskStore();

  const handleGenerate = async () => {
    if (!topic.trim() && !script.trim()) {
      toast.error(t("newProject.enterTopicOrScript", language));
      return;
    }

    setIsGenerating(true);
    let finalScript = script;

    try {
      if (!script.trim() && topic.trim()) {
        toast.info(t("newProject.generatingScript", language));
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Write a short, engaging video script about: "${topic}". The video should be approximately ${duration[0]} seconds long. Do not include camera directions or scene descriptions, just the spoken text.`,
        });

        finalScript = response.text || "";
        if (!finalScript) throw new Error("Failed to generate script");

        setScript(finalScript);
        toast.success(t("newProject.scriptGenerated", language));
      }

      const taskId = Math.random().toString(36).substring(7);

      addTask({
        id: taskId,
        topic: topic || "Custom Script",
        status: "pending",
        progress: 0,
        createdAt: Date.now(),
        script: finalScript,
      });

      toast.success(t("newProject.taskCreated", language));
      setActiveTab("tasks");

      simulateTaskProgress(taskId);
    } catch (error) {
      console.error("Error generating script:", error);
      toast.error(t("newProject.scriptFailed", language));
    } finally {
      setIsGenerating(false);
    }
  };

  const simulateTaskProgress = (taskId: string) => {
    const updateTask = useTaskStore.getState().updateTask;

    const stages = [
      { status: "generating_audio", progress: 30, time: 2000 },
      { status: "gathering_visuals", progress: 60, time: 5000 },
      { status: "rendering", progress: 85, time: 8000 },
      { status: "completed", progress: 100, time: 12000 },
    ] as const;

    let cumulativeTime = 0;
    stages.forEach((stage) => {
      cumulativeTime += stage.time;
      setTimeout(() => {
        updateTask(taskId, { status: stage.status, progress: stage.progress });
        if (stage.status === "completed") {
          toast.success(t("newProject.videoCompleted", language));
        }
      }, cumulativeTime);
    });
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("newProject.title", language)}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("newProject.desc", language)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
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
                  className="min-h-[150px]"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

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
                      onValueChange={setDuration}
                      max={180}
                      min={15}
                      step={15}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">
                    {t("newProject.aiVisuals", language)}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("newProject.aiVisualsDesc", language)}
                  </p>
                </div>
                <Switch
                  checked={useAiVisuals}
                  onCheckedChange={setUseAiVisuals}
                />
              </div>
            </CardContent>
          </Card>
        </div>

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
                    <SelectItem value="alloy">
                      {t("newProject.alloy", language)}
                    </SelectItem>
                    <SelectItem value="echo">
                      {t("newProject.echo", language)}
                    </SelectItem>
                    <SelectItem value="fable">
                      {t("newProject.fable", language)}
                    </SelectItem>
                    <SelectItem value="nova">
                      {t("newProject.nova", language)}
                    </SelectItem>
                    <SelectItem value="shimmer">
                      {t("newProject.shimmer", language)}
                    </SelectItem>
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
                    <SelectItem value="none">
                      {t("newProject.none", language)}
                    </SelectItem>
                    <SelectItem value="cinematic">
                      {t("newProject.cinematic", language)}
                    </SelectItem>
                    <SelectItem value="lofi">
                      {t("newProject.lofi", language)}
                    </SelectItem>
                    <SelectItem value="upbeat">
                      {t("newProject.upbeat", language)}
                    </SelectItem>
                    <SelectItem value="ambient">
                      {t("newProject.ambient", language)}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

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
