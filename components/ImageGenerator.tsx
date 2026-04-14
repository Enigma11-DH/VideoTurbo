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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Image as ImageIcon,
  Wand2,
  Loader2,
  Download,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { GoogleGenAI } from "@google/genai";
import { useTaskStore } from "@/lib/store";
import { t } from "@/lib/i18n";

export function ImageGenerator() {
  const language = useTaskStore((state) => state.language);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gemini-3-pro-image-preview");
  const [size, setSize] = useState("1K");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const [editPrompt, setEditPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceMimeType, setReferenceMimeType] = useState<string>("");

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(t("assets.enterPrompt", language));
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: size,
          },
        },
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
          setGeneratedImage(imageUrl);
          foundImage = true;
          toast.success(t("assets.generatedSuccess", language));
          break;
        }
      }

      if (!foundImage) {
        throw new Error("No image returned from the model");
      }
    } catch (error) {
      console.error("Generation error:", error);
      toast.error(t("assets.generatedFailed", language));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setReferenceImage(result.split(",")[1]);
        setReferenceMimeType(file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = async () => {
    if (!editPrompt.trim() || !referenceImage) {
      toast.error(t("assets.provideBoth", language));
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: {
          parts: [
            {
              inlineData: {
                data: referenceImage,
                mimeType: referenceMimeType,
              },
            },
            { text: editPrompt },
          ],
        },
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
          setGeneratedImage(imageUrl);
          foundImage = true;
          toast.success(t("assets.editedSuccess", language));
          break;
        }
      }

      if (!foundImage) {
        throw new Error("No image returned from the model");
      }
    } catch (error) {
      console.error("Edit error:", error);
      toast.error(t("assets.editedFailed", language));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("assets.title", language)}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("assets.desc", language)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Controls */}
        <div className="lg:col-span-4 space-y-6">
          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="generate">
                {t("assets.generate", language)}
              </TabsTrigger>
              <TabsTrigger value="edit">
                {t("assets.edit", language)}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t("assets.imageSettings", language)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("assets.model", language)}</Label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini-3-pro-image-preview">
                          {t("assets.proModel", language)}
                        </SelectItem>
                        <SelectItem value="gemini-3.1-flash-image-preview">
                          {t("assets.flashModel", language)}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("assets.resolution", language)}</Label>
                    <Select value={size} onValueChange={setSize}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1K">
                          {t("assets.standard", language)}
                        </SelectItem>
                        <SelectItem value="2K">
                          {t("assets.high", language)}
                        </SelectItem>
                        <SelectItem value="4K">
                          {t("assets.ultra", language)}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("assets.aspectRatio", language)}</Label>
                    <Select value={aspectRatio} onValueChange={setAspectRatio}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="16:9">
                          {t("assets.landscape", language)}
                        </SelectItem>
                        <SelectItem value="9:16">
                          {t("assets.portrait", language)}
                        </SelectItem>
                        <SelectItem value="1:1">
                          {t("assets.square", language)}
                        </SelectItem>
                        <SelectItem value="4:3">
                          {t("assets.classic", language)}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 pt-2">
                    <Label>{t("assets.prompt", language)}</Label>
                    <Textarea
                      placeholder={t("assets.promptPlaceholder", language)}
                      className="min-h-[120px] resize-none"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    {isGenerating
                      ? t("assets.generatingMsg", language)
                      : t("assets.generateImage", language)}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="edit" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t("assets.editImage", language)}
                  </CardTitle>
                  <CardDescription>
                    {t("assets.uploadRef", language)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Label
                    htmlFor="image-upload"
                    className="block border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer relative overflow-hidden"
                  >
                    {referenceImage ? (
                      <img
                        src={`data:${referenceMimeType};base64,${referenceImage}`}
                        alt="Reference"
                        className="absolute inset-0 w-full h-full object-cover opacity-30"
                      />
                    ) : null}
                    <div className="relative z-10">
                      <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">
                        {referenceImage
                          ? t("assets.imageSelected", language)
                          : t("assets.clickUpload", language)}
                      </p>
                    </div>
                  </Label>
                  <Input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />

                  <div className="space-y-2">
                    <Label>{t("assets.editPrompt", language)}</Label>
                    <Textarea
                      placeholder={t("assets.editPromptPlaceholder", language)}
                      className="min-h-[100px] resize-none"
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                    />
                  </div>

                  <Button
                    className="w-full"
                    variant="secondary"
                    onClick={handleEdit}
                    disabled={isGenerating || !referenceImage}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-2" />
                    )}
                    {isGenerating
                      ? t("assets.applying", language)
                      : t("assets.applyEdits", language)}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview Area */}
        <div className="lg:col-span-8">
          <Card className="h-full min-h-[500px] flex flex-col overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center">
                  <ImageIcon className="w-5 h-5 mr-2 text-primary" />
                  {t("assets.preview", language)}
                </CardTitle>
                {generatedImage && (
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    {t("assets.saveAsset", language)}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 flex items-center justify-center bg-zinc-950/5 relative">
              {isGenerating ? (
                <div className="flex flex-col items-center text-muted-foreground">
                  <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
                  <p>{t("assets.generatingMsg", language)}</p>
                </div>
              ) : generatedImage ? (
                <img
                  src={generatedImage}
                  alt="Generated"
                  className="max-w-full max-h-[600px] object-contain p-4"
                />
              ) : (
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>{t("assets.appearHere", language)}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
