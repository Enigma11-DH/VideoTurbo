import { useState, useRef, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Play,
  Pause,
  Scissors,
  Wand2,
  Loader2,
  FileVideo,
  Globe,
  Film,
  LayoutTemplate,
  Split,
  Merge,
  Search,
  Type,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { useTaskStore } from "@/lib/store";
import { t } from "@/lib/i18n";

interface VideoAsset {
  id: string;
  type: "user" | "platform";
  url: string;
  name: string;
  file?: File;
}

interface TimelineClip {
  id: string;
  assetId: string;
  duration: number;
  description: string;
  source: "user" | "platform";
  textOverlay?: string;
  transition?: string;
}

const SAMPLE_VIDEOS = [
  "https://www.w3schools.com/html/mov_bbb.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4",
  "https://www.w3schools.com/html/mov_bbb.mp4",
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4",
  "https://www.w3schools.com/html/mov_bbb.mp4",
];

export function Studio() {
  const language = useTaskStore((state) => state.language);
  const [userAssets, setUserAssets] = useState<VideoAsset[]>([]);
  const [platformAssets, setPlatformAssets] = useState<VideoAsset[]>([]);
  const [timeline, setTimeline] = useState<TimelineClip[]>([]);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isRenderingCapCut, setIsRenderingCapCut] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [isCapCutJob, setIsCapCutJob] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (renderJobId && (isRendering || isRenderingCapCut)) {
      interval = setInterval(async () => {
        try {
          const endpoint = isCapCutJob ? `/api/render/capcut/${renderJobId}` : `/api/render/${renderJobId}`;
          const res = await fetch(endpoint);
          const data = await res.json();
          if (data.status === 'completed') {
            setFinalVideoUrl(data.url);
            setIsRendering(false);
            setIsRenderingCapCut(false);
            setRenderJobId(null);
            setIsCapCutJob(false);
            toast.success(language === 'en' ? 'Video rendered successfully!' : '视频渲染完成！');
          } else if (data.status === 'failed') {
            setIsRendering(false);
            setIsRenderingCapCut(false);
            setRenderJobId(null);
            setIsCapCutJob(false);
            toast.error(language === 'en' ? 'Render failed' : '渲染失败');
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [renderJobId, isRendering, isRenderingCapCut, isCapCutJob, language]);

  const handleFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAssets = files.map((file) => ({
      id: Math.random().toString(36).substring(7),
      type: "user" as const,
      url: URL.createObjectURL(file),
      name: file.name,
      file,
    }));

    setUserAssets((prev) => [...prev, ...newAssets]);
    if (!activeVideoUrl && newAssets.length > 0) {
      setActiveVideoUrl(newAssets[0].url);
    }
    toast.success(
      `${t("studio.imported", language)} ${files.length} ${t("studio.videos", language)}`,
    );
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const autoEdit = async () => {
    if (!topic.trim() && userAssets.length === 0) {
      toast.error(t("studio.emptyTopicError", language));
      return;
    }

    setIsGenerating(true);
    toast.info(t("studio.analyzing", language));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
      Act as an expert TikTok video editor and viral content analyzer.
      Theme/Topic: "${topic || "Based on uploaded videos"}"
      Available User Uploaded Videos: ${userAssets.map((a) => a.name).join(", ") || "None"}

      First, USE THE GOOGLE SEARCH TOOL to search "site:douyin.com ${topic}" to find real, current high-view-count viral videos related to this topic. Learn from their actual titles, captions, and structures.
      Then, create a storyboard for a short, engaging video (approx 15-45s) that mimics these real viral patterns you just searched.
      Mix the user's uploaded videos (if any) with new footage that needs to be automatically fetched from Douyin.
      Specifically, extract highly relevant and suitable materials from Douyin for both main clips and engaging transitions (转场).
      Also, generate catchy, viral-style text overlays (captions) for each clip based on the real Douyin trends you found.
      Do not generate any redundant or unnecessary modules, keep it concise and impactful.
      Return ONLY a JSON array of scenes.
      Format:
      [
        {
          "source": "user" or "platform",
          "assetName": "name of user video if source is user, otherwise empty",
          "searchQuery": "search query for Douyin if source is platform, otherwise empty",
          "duration": <number in seconds>,
          "description": "what happens in this scene",
          "textOverlay": "catchy text to display on screen during this clip, or empty if none",
          "transition": "transition effect from the previous clip (e.g., 'fade', 'zoom', 'glitch', 'swipe', 'none')"
        }
      ]
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          tools: [{ googleSearch: {} }]
        },
      });

      const scenes = JSON.parse(response.text || "[]");

      toast.info(t("studio.fetching", language));

      const newPlatformAssets: VideoAsset[] = [];
      const newTimeline: TimelineClip[] = [];

      for (const scene of scenes) {
        let assetId = "";

        if (scene.source === "user" && userAssets.length > 0) {
          const existing =
            userAssets.find((a) => a.name === scene.assetName) || userAssets[0];
          if (existing) {
            assetId = existing.id;
          }
        } else {
          // Auto-fetch from Douyin
          const newAsset: VideoAsset = {
            id: Math.random().toString(36).substring(7),
            type: "platform",
            url: SAMPLE_VIDEOS[
              Math.floor(Math.random() * SAMPLE_VIDEOS.length)
            ],
            name: `Douyin Auto: ${scene.searchQuery || topic || "Trending"}`,
          };
          newPlatformAssets.push(newAsset);
          assetId = newAsset.id;
        }

        if (assetId) {
          newTimeline.push({
            id: Math.random().toString(36).substring(7),
            assetId,
            duration: scene.duration || 5,
            description: scene.description,
            source:
              scene.source === "user" && userAssets.length > 0
                ? "user"
                : "platform",
            textOverlay: scene.textOverlay,
            transition: scene.transition,
          });
        }
      }

      setPlatformAssets((prev) => [...prev, ...newPlatformAssets]);
      setTimeline(newTimeline);

      if (newTimeline.length > 0) {
        const firstAsset = [...userAssets, ...newPlatformAssets].find(
          (a) => a.id === newTimeline[0].assetId,
        );
        if (firstAsset) setActiveVideoUrl(firstAsset.url);
      }

      toast.success(t("studio.complete", language));
    } catch (error) {
      console.error(error);
      toast.error(t("studio.failed", language));
    } finally {
      setIsGenerating(false);
    }
  };

  const renderVideo = async (useCapCut: boolean = false) => {
    if (timeline.length === 0) {
      toast.error(language === "en" ? "Timeline is empty" : "时间轴为空");
      return;
    }

    if (useCapCut) {
      setIsRenderingCapCut(true);
    } else {
      setIsRendering(true);
    }
    setFinalVideoUrl(null);
    toast.info(language === "en" ? "Starting render engine..." : "正在启动渲染引擎...");

    try {
      // Prepare payload with actual URLs
      const payload = timeline.map(clip => {
        const asset = [...userAssets, ...platformAssets].find(a => a.id === clip.assetId);
        return {
          ...clip,
          url: asset?.url
        };
      });

      const endpoint = useCapCut ? '/api/render/capcut' : '/api/render';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeline: payload })
      });

      const data = await res.json();
      if (data.jobId) {
        setRenderJobId(data.jobId);
        setIsCapCutJob(useCapCut);
        toast.success(language === "en" ? "Render job queued" : "渲染任务已加入队列");
      } else {
        throw new Error(data.error || "Failed to start render");
      }
    } catch (error) {
      console.error(error);
      setIsRendering(false);
      setIsRenderingCapCut(false);
      toast.error(language === "en" ? "Failed to start render" : "启动渲染失败");
    }
  };

  const playClip = (assetId: string) => {
    setPreviewIndex(null); // Stop sequence if playing
    const asset = [...userAssets, ...platformAssets].find(
      (a) => a.id === assetId,
    );
    if (asset) {
      setActiveVideoUrl(asset.url);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play();
          setIsPlaying(true);
        }
      }, 100);
    }
  };

  useEffect(() => {
    if (previewIndex !== null && timeline[previewIndex]) {
      const clip = timeline[previewIndex];
      const asset = [...userAssets, ...platformAssets].find(
        (a) => a.id === clip.assetId,
      );
      if (asset) {
        setActiveVideoUrl(asset.url);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch((e) => console.error(e));
            setIsPlaying(true);
          }
        }, 50);
      }
    }
  }, [previewIndex, timeline, userAssets, platformAssets]);

  const handleTimeUpdate = () => {
    if (previewIndex !== null && videoRef.current) {
      const currentClip = timeline[previewIndex];
      if (videoRef.current.currentTime >= currentClip.duration) {
        if (previewIndex + 1 < timeline.length) {
          setPreviewIndex(previewIndex + 1);
        } else {
          setPreviewIndex(null);
          setIsPlaying(false);
          videoRef.current.pause();
        }
      }
    }
  };

  const startFullPreview = () => {
    if (timeline.length === 0) {
      toast.error(t("studio.timelineEmpty", language));
      return;
    }
    setPreviewIndex(0);
  };

  const stopFullPreview = () => {
    setPreviewIndex(null);
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
  };

  const trimClip = () => {
    if (!selectedClipId) return;
    const index = timeline.findIndex(c => c.id === selectedClipId);
    if (index === -1) return;
    const clip = timeline[index];
    if (clip.duration <= 1) {
      toast.error(language === "en" ? "Clip is too short to trim" : "片段太短，无法裁剪");
      return;
    }
    const newTimeline = [...timeline];
    newTimeline[index] = { ...clip, duration: clip.duration - 1 };
    setTimeline(newTimeline);
    toast.success(language === "en" ? "Trimmed 1s from clip" : "已裁剪 1 秒");
  };

  const splitClip = () => {
    if (!selectedClipId) return;
    const index = timeline.findIndex(c => c.id === selectedClipId);
    if (index === -1) return;
    const clip = timeline[index];
    if (clip.duration <= 1) {
      toast.error(language === "en" ? "Clip is too short to split" : "片段太短，无法拆分");
      return;
    }
    const half = Math.floor(clip.duration / 2);
    const newClip1 = { ...clip, id: Math.random().toString(36).substring(7), duration: half };
    const newClip2 = { ...clip, id: Math.random().toString(36).substring(7), duration: clip.duration - half };
    
    const newTimeline = [...timeline];
    newTimeline.splice(index, 1, newClip1, newClip2);
    setTimeline(newTimeline);
    setSelectedClipId(newClip1.id);
    toast.success(language === "en" ? "Clip split successfully" : "片段拆分成功");
  };

  const mergeClip = () => {
    if (!selectedClipId) return;
    const index = timeline.findIndex(c => c.id === selectedClipId);
    if (index === -1 || index === timeline.length - 1) {
      toast.error(language === "en" ? "Cannot merge: no next clip" : "无法合并：没有下一个片段");
      return;
    }
    const clip1 = timeline[index];
    const clip2 = timeline[index + 1];
    
    const mergedClip = {
      ...clip1,
      id: Math.random().toString(36).substring(7),
      duration: clip1.duration + clip2.duration,
      description: `${clip1.description} + ${clip2.description}`
    };
    
    const newTimeline = [...timeline];
    newTimeline.splice(index, 2, mergedClip);
    setTimeline(newTimeline);
    setSelectedClipId(mergedClip.id);
    toast.success(language === "en" ? "Clips merged successfully" : "片段合并成功");
  };

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      {/* Left Panel: Assets Library */}
      <div className="w-full md:w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="font-semibold text-white flex items-center">
            <Film className="w-4 h-4 mr-2" />
            {t("studio.mediaLibrary", language)}
          </h2>
        </div>

        <Tabs defaultValue="uploads" className="flex-1 flex flex-col">
          <TabsList className="w-full grid grid-cols-2 rounded-none border-b border-zinc-800 bg-zinc-900 text-zinc-400">
            <TabsTrigger
              value="uploads"
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white rounded-none"
            >
              {t("studio.myUploads", language)}
            </TabsTrigger>
            <TabsTrigger
              value="platform"
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white rounded-none"
            >
              {t("studio.platform", language)}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="uploads"
            className="flex-1 p-0 m-0 overflow-hidden flex flex-col"
          >
            <div className="p-4 border-b border-zinc-800">
              <Label
                htmlFor="video-upload-multiple"
                className="cursor-pointer w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2"
              >
                <Upload className="w-4 h-4 mr-2" />
                {t("studio.importVideos", language)}
              </Label>
              <Input
                id="video-upload-multiple"
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={handleFilesUpload}
              />
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-2">
                {userAssets.length === 0 ? (
                  <div className="text-center p-4 text-sm text-zinc-500">
                    {t("studio.noVideos", language)}
                  </div>
                ) : (
                  userAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="p-2 bg-zinc-900 rounded border border-zinc-800 hover:border-zinc-600 cursor-pointer flex items-center group"
                      onClick={() => playClip(asset.id)}
                    >
                      <FileVideo className="w-8 h-8 text-indigo-400 mr-3 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate">
                          {asset.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 uppercase">
                          {t("studio.userUpload", language)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="platform"
            className="flex-1 p-0 m-0 overflow-hidden flex flex-col"
          >
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-2">
                {platformAssets.length === 0 ? (
                  <div className="text-center p-4 text-sm text-zinc-500">
                    {t("studio.platformVideosAppear", language)}
                  </div>
                ) : (
                  platformAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="p-2 bg-zinc-900 rounded border border-zinc-800 hover:border-zinc-600 cursor-pointer flex items-center group"
                      onClick={() => playClip(asset.id)}
                    >
                      <Globe className="w-8 h-8 text-emerald-400 mr-3 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate">
                          {asset.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 uppercase">
                          {t("studio.platformFetch", language)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Center Panel: Player & Timeline */}
      <div className="flex-1 flex flex-col bg-black border-r border-zinc-800 min-w-0">
        {/* Video Player */}
        <div className="flex-1 relative flex items-center justify-center p-4 min-h-[300px]">
          {previewIndex !== null && (
            <div className="absolute top-4 left-4 z-10 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded animate-pulse">
              {t("studio.previewing", language)}
            </div>
          )}
          {finalVideoUrl ? (
            <div className="relative max-h-full max-w-full flex flex-col items-center justify-center">
              <video
                src={finalVideoUrl}
                className="max-h-[80%] max-w-full object-contain rounded-md shadow-2xl border-2 border-indigo-500"
                controls
                autoPlay
              />
              <div className="mt-4 flex space-x-4">
                <Button variant="default" onClick={() => window.open(finalVideoUrl, '_blank')}>
                  {language === "en" ? "Download MP4" : "下载 MP4"}
                </Button>
                <Button variant="outline" onClick={() => setFinalVideoUrl(null)}>
                  {language === "en" ? "Back to Editor" : "返回编辑器"}
                </Button>
              </div>
            </div>
          ) : activeVideoUrl ? (
            <div className="relative max-h-full max-w-full">
              <video
                ref={videoRef}
                src={activeVideoUrl}
                className="max-h-full max-w-full object-contain rounded-md shadow-2xl"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                controls={false}
                loop={previewIndex === null}
              />
              {previewIndex !== null && timeline[previewIndex]?.textOverlay && (
                <div className="absolute bottom-10 left-0 right-0 text-center pointer-events-none">
                  <span className="bg-black/60 text-white font-bold px-4 py-2 rounded-lg text-lg md:text-2xl shadow-lg backdrop-blur-sm border border-white/20 inline-block max-w-[90%]">
                    {timeline[previewIndex].textOverlay}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto">
                <LayoutTemplate className="w-10 h-10 text-zinc-600" />
              </div>
              <p className="text-zinc-500 text-sm">
                {t("studio.importOrAuto", language)}
              </p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="h-56 bg-zinc-950 border-t border-zinc-800 flex flex-col shrink-0">
          <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-zinc-900">
            <div className="flex items-center space-x-2">
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-zinc-800 text-white hover:bg-zinc-700"
                onClick={togglePlay}
                disabled={!activeVideoUrl}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              <span className="text-xs font-medium text-zinc-400 ml-2 uppercase tracking-wider">
                {t("studio.masterTimeline", language)}
              </span>

              {timeline.length > 0 && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant={previewIndex !== null ? "destructive" : "default"}
                    size="sm"
                    className="h-8 ml-4 text-xs"
                    onClick={
                      previewIndex !== null ? stopFullPreview : startFullPreview
                    }
                  >
                    {previewIndex !== null ? (
                      <Pause className="w-3 h-3 mr-1" />
                    ) : (
                      <Play className="w-3 h-3 mr-1" />
                    )}
                    {previewIndex !== null
                      ? t("studio.stopPreview", language)
                      : t("studio.playFullVideo", language)}
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                    onClick={() => renderVideo(false)}
                    disabled={isRendering || isRenderingCapCut}
                  >
                    {isRendering ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Film className="w-3 h-3 mr-1" />
                    )}
                    {isRendering 
                      ? (language === "en" ? "Rendering..." : "正在渲染...") 
                      : (language === "en" ? "Export MP4" : "导出 MP4 成片")}
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 text-xs bg-pink-600 hover:bg-pink-700 text-white"
                    onClick={() => renderVideo(true)}
                    disabled={isRendering || isRenderingCapCut}
                  >
                    {isRenderingCapCut ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Scissors className="w-3 h-3 mr-1" />
                    )}
                    {isRenderingCapCut 
                      ? (language === "en" ? "CapCut Rendering..." : "剪映渲染中...") 
                      : (language === "en" ? "Export via CapCut" : "通过剪映导出")}
                  </Button>
                </div>
              )}

              {selectedClipId && (
                <div className="flex items-center space-x-1 ml-4 border-l border-zinc-700 pl-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs bg-zinc-800 text-white hover:bg-zinc-700"
                    onClick={trimClip}
                    title="Trim 1s"
                  >
                    <Scissors className="w-3 h-3 mr-1" />
                    Trim
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs bg-zinc-800 text-white hover:bg-zinc-700"
                    onClick={splitClip}
                    title="Split in half"
                  >
                    <Split className="w-3 h-3 mr-1" />
                    Split
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs bg-zinc-800 text-white hover:bg-zinc-700"
                    onClick={mergeClip}
                    title="Merge with next"
                  >
                    <Merge className="w-3 h-3 mr-1" />
                    Merge
                  </Button>
                </div>
              )}
            </div>
            <div className="text-xs text-zinc-500 font-mono">
              {timeline.length} {t("studio.clips", language)} • ~
              {timeline.reduce((acc, clip) => acc + clip.duration, 0)}s{" "}
              {t("studio.total", language)}
            </div>
          </div>

          <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex items-center gap-2 bg-zinc-950">
            {timeline.length === 0 ? (
              <div className="w-full text-center text-zinc-600 text-sm italic">
                {t("studio.timelineEmpty", language)}
              </div>
            ) : (
              timeline.map((clip, index) => (
                <div
                  key={clip.id}
                  className={`h-24 rounded-md border-2 flex flex-col justify-between p-2 cursor-pointer shrink-0 transition-all hover:brightness-110 ${
                    clip.source === "user"
                      ? "bg-indigo-900/40 border-indigo-500/50 w-40"
                      : "bg-emerald-900/40 border-emerald-500/50 w-48"
                  } ${previewIndex === index ? "ring-2 ring-white scale-105" : ""} ${selectedClipId === clip.id && previewIndex === null ? "ring-2 ring-primary" : ""}`}
                  onClick={() => {
                    setSelectedClipId(clip.id);
                    playClip(clip.assetId);
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/70 flex items-center">
                      {clip.source === "user" ? (
                        <FileVideo className="w-3 h-3 mr-1" />
                      ) : (
                        <Globe className="w-3 h-3 mr-1" />
                      )}
                      {clip.source}
                    </span>
                    <div className="flex items-center space-x-1">
                      {clip.textOverlay && (
                        <Type className="w-3 h-3 text-amber-400" title="Has Text Overlay" />
                      )}
                      {clip.transition && clip.transition !== "none" && (
                        <ArrowRightLeft className="w-3 h-3 text-pink-400" title={`Transition: ${clip.transition}`} />
                      )}
                      <span className="text-[10px] bg-black/50 px-1.5 py-0.5 rounded text-white font-mono">
                        {clip.duration}s
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-white line-clamp-2 leading-tight font-medium">
                    {clip.description}
                  </p>
                  {clip.textOverlay && (
                    <p className="text-[10px] text-amber-200/80 truncate mt-1 italic">
                      "{clip.textOverlay}"
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Panel: AI Auto-Director */}
      <div className="w-full md:w-80 bg-background flex flex-col h-full shrink-0">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold flex items-center">
            <Wand2 className="w-4 h-4 mr-2 text-primary" />
            {t("studio.aiAutoDirector", language)}
          </h2>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-6">
            <Card className="border-primary/20 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {t("studio.smartEdit", language)}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("studio.smartEditDesc", language)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("studio.videoTopic", language)}
                  </Label>
                  <Input
                    placeholder={t("studio.topicPlaceholder", language)}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={autoEdit}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Scissors className="w-4 h-4 mr-2" />
                  )}
                  {isGenerating
                    ? t("studio.autoEditing", language)
                    : t("studio.fetchAndAutoEdit", language)}
                </Button>
              </CardContent>
            </Card>

            <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
              <h3 className="font-semibold flex items-center text-xs uppercase tracking-wider text-muted-foreground">
                <Globe className="w-3 h-3 mr-1" />{" "}
                {t("studio.howItWorks", language)}
              </h3>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                {language === "en" ? (
                  <>
                    <li>Upload your own raw footage.</li>
                    <li>Enter a topic or theme.</li>
                    <li>AI uses Google Search to learn from real Douyin trends.</li>
                    <li>AI generates a storyboard with captions and transitions.</li>
                    <li>Missing B-roll is simulated (requires Douyin API for real videos).</li>
                    <li>Advanced editing requires Jianying (CapCut) API integration.</li>
                  </>
                ) : (
                  <>
                    <li>上传您自己的原始素材。</li>
                    <li>输入主题或关键字。</li>
                    <li>AI 实时搜索抖音，学习真实的爆款文案和节奏。</li>
                    <li>AI 生成包含字幕和转场的视频分镜脚本。</li>
                    <li>自动填充占位素材画面（获取真实无水印视频需接入抖音开放平台 API）。</li>
                    <li>如需导出带特效的成片，可对接剪映 API（或导出草稿工程文件）。</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
