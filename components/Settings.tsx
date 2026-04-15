import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Key,
  Save,
  Sparkles,
  Film,
  Music,
  Globe,
  Plus,
  Trash2,
  ShieldCheck,
  RotateCcw,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useTaskStore } from "@/lib/store";
import {
  useSettingsStore,
  type CustomApiEntry,
  type LlmConfig,
  LLM_PRESETS,
} from "@/lib/settings-store";
import { t } from "@/lib/i18n";

// ---------- Reusable sub-components ----------

function ApiKeyInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  description,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  description: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

// ---------- LLM Config Row ----------

function LlmConfigRow({
  config,
  isActive,
  onActivate,
  onChange,
  onRemove,
}: {
  config: LlmConfig;
  isActive: boolean;
  onActivate: () => void;
  onChange: (updates: Partial<LlmConfig>) => void;
  onRemove: () => void;
}) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 transition-colors ${
        isActive ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      {/* Row header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onActivate}
          className="flex items-center gap-2 text-sm font-medium"
        >
          {isActive ? (
            <CheckCircle2 className="w-4 h-4 text-primary" />
          ) : (
            <Circle className="w-4 h-4 text-muted-foreground" />
          )}
          <Input
            value={config.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="模型名称（显示用）"
            className="h-7 text-sm border-0 bg-transparent p-0 focus-visible:ring-0 w-40"
            onClick={(e) => e.stopPropagation()}
          />
        </button>
        <div className="flex items-center gap-2">
          {isActive && (
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
              当前使用
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
            onClick={onRemove}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            删除
          </Button>
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Base URL</Label>
          <Input
            value={config.baseUrl}
            onChange={(e) => onChange({ baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">API Key</Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={config.apiKey}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="h-8 text-sm pr-8"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">模型名</Label>
          <Input
            value={config.model}
            onChange={(e) => onChange({ model: e.target.value })}
            placeholder="qwen-turbo"
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Main Settings Component ----------

export function Settings() {
  const language = useTaskStore((state) => state.language);
  const store = useSettingsStore();

  // LLM state (live — no batch save needed for list items)
  const { llmConfigs, activeLlmId, addLlmConfig, removeLlmConfig, updateLlmConfig, setActiveLlmId } = store;

  // Local state for non-LLM fields (batch save)
  const [pexelsApiKey, setPexelsApiKey] = useState(store.pexelsApiKey);
  const [capcutApiKey, setCapcutApiKey] = useState(store.capcutApiKey);
  const [capcutApiBaseUrl, setCapcutApiBaseUrl] = useState(store.capcutApiBaseUrl);
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState(store.elevenlabsApiKey);
  const [douyinOpenApiKey, setDouyinOpenApiKey] = useState(store.douyinOpenApiKey);
  const [douyinOpenApiBaseUrl, setDouyinOpenApiBaseUrl] = useState(store.douyinOpenApiBaseUrl);
  const [xiaohongshuApiKey, setXiaohongshuApiKey] = useState(store.xiaohongshuApiKey);
  const [bilibiliApiKey, setBilibiliApiKey] = useState(store.bilibiliApiKey);
  const [bilibiliApiSecret, setBilibiliApiSecret] = useState(store.bilibiliApiSecret);
  const [customApis, setCustomApis] = useState<CustomApiEntry[]>(store.customApis);

  useEffect(() => {
    setPexelsApiKey(store.pexelsApiKey);
    setCapcutApiKey(store.capcutApiKey);
    setCapcutApiBaseUrl(store.capcutApiBaseUrl);
    setElevenlabsApiKey(store.elevenlabsApiKey);
    setDouyinOpenApiKey(store.douyinOpenApiKey);
    setDouyinOpenApiBaseUrl(store.douyinOpenApiBaseUrl);
    setXiaohongshuApiKey(store.xiaohongshuApiKey);
    setBilibiliApiKey(store.bilibiliApiKey);
    setBilibiliApiSecret(store.bilibiliApiSecret);
    setCustomApis(store.customApis);
  }, [store]);

  const handleSave = () => {
    store.setSettings({
      pexelsApiKey,
      capcutApiKey,
      capcutApiBaseUrl,
      elevenlabsApiKey,
      douyinOpenApiKey,
      douyinOpenApiBaseUrl,
      xiaohongshuApiKey,
      bilibiliApiKey,
      bilibiliApiSecret,
      customApis,
    });
    toast.success(t("settings.saved", language));
  };

  const handleReset = () => {
    if (!window.confirm(t("settings.resetConfirm", language))) return;
    store.setSettings({
      llmConfigs: [],
      activeLlmId: '',
      pexelsApiKey: "",
      capcutApiKey: "",
      capcutApiBaseUrl: "https://open.capcut.com",
      elevenlabsApiKey: "",
      douyinOpenApiKey: "",
      douyinOpenApiBaseUrl: "",
      xiaohongshuApiKey: "",
      bilibiliApiKey: "",
      bilibiliApiSecret: "",
      customApis: [],
    });
    setPexelsApiKey("");
    setCapcutApiKey("");
    setCapcutApiBaseUrl("https://open.capcut.com");
    setElevenlabsApiKey("");
    setDouyinOpenApiKey("");
    setDouyinOpenApiBaseUrl("");
    setXiaohongshuApiKey("");
    setBilibiliApiKey("");
    setBilibiliApiSecret("");
    setCustomApis([]);
    toast.success(t("settings.resetDone", language));
  };

  const addLlmFromPreset = (preset: typeof LLM_PRESETS[number]) => {
    addLlmConfig({
      id: Math.random().toString(36).substring(7),
      name: preset.label,
      baseUrl: preset.baseUrl,
      apiKey: "",
      model: preset.model,
    });
  };

  const addCustomLlm = () => {
    addLlmConfig({
      id: Math.random().toString(36).substring(7),
      name: "自定义模型",
      baseUrl: "",
      apiKey: "",
      model: "",
    });
  };

  const addCustomApi = () => {
    setCustomApis((prev) => [
      ...prev,
      { id: Math.random().toString(36).substring(7), name: "", key: "", baseUrl: "", description: "" },
    ]);
  };

  const updateCustomApi = (id: string, updates: Partial<CustomApiEntry>) => {
    setCustomApis((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const removeCustomApi = (id: string) => {
    setCustomApis((prev) => prev.filter((a) => a.id !== id));
  };

  const configuredCount = [
    ...llmConfigs.filter((c) => c.apiKey).map(() => true),
    pexelsApiKey,
    capcutApiKey,
    elevenlabsApiKey,
    douyinOpenApiKey,
    xiaohongshuApiKey,
    bilibiliApiKey,
    ...customApis.map((a) => a.key),
  ].filter(Boolean).length;

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("settings.title", language)}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("settings.desc", language)}
        </p>
        <div className="flex items-center gap-3 mt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            {t("settings.systemNote", language)}
          </div>
          <Badge variant="secondary">
            {configuredCount} {language === "en" ? "configured" : "已配置"}
          </Badge>
        </div>
      </div>

      {/* 1. AI 大模型 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Sparkles className="w-5 h-5 mr-2 text-violet-500" />
            AI 大模型
          </CardTitle>
          <CardDescription>
            配置用于分镜生成的大模型，支持文心一言、通义千问、OpenAI、DeepSeek 等所有 OpenAI 兼容接口。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preset quick-add buttons */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">快速添加预设</Label>
            <div className="flex flex-wrap gap-2">
              {LLM_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => addLlmFromPreset(preset)}
                >
                  <Zap className="w-3 h-3 mr-1 text-yellow-500" />
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* LLM config list */}
          {llmConfigs.length > 0 && (
            <div className="space-y-3">
              {llmConfigs.map((cfg) => (
                <LlmConfigRow
                  key={cfg.id}
                  config={cfg}
                  isActive={activeLlmId === cfg.id}
                  onActivate={() => setActiveLlmId(cfg.id)}
                  onChange={(updates) => updateLlmConfig(cfg.id, updates)}
                  onRemove={() => removeLlmConfig(cfg.id)}
                />
              ))}
            </div>
          )}

          {llmConfigs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
              暂未配置大模型，点击上方预设按钮快速添加
            </p>
          )}

          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={addCustomLlm}
          >
            <Plus className="w-4 h-4 mr-2" />
            添加自定义模型
          </Button>
        </CardContent>
      </Card>

      {/* 2. Video & Media */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Film className="w-5 h-5 mr-2 text-blue-500" />
            {t("settings.videoMedia", language)}
          </CardTitle>
          <CardDescription>{t("settings.videoMediaDesc", language)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ApiKeyInput
            id="pexels"
            label={t("settings.pexels", language)}
            value={pexelsApiKey}
            onChange={setPexelsApiKey}
            placeholder={t("settings.pexelsPlaceholder", language)}
            description={t("settings.pexelsDesc", language)}
          />
          <Separator />
          <ApiKeyInput
            id="capcut"
            label={t("settings.capcut", language)}
            value={capcutApiKey}
            onChange={setCapcutApiKey}
            placeholder={t("settings.capcutPlaceholder", language)}
            description={t("settings.capcutDesc", language)}
          />
          <div className="space-y-2">
            <Label htmlFor="capcut-base-url" className="text-sm font-medium">
              {t("settings.capcutBaseUrl", language)}
            </Label>
            <Input
              id="capcut-base-url"
              value={capcutApiBaseUrl}
              onChange={(e) => setCapcutApiBaseUrl(e.target.value)}
              placeholder={t("settings.capcutBaseUrlPlaceholder", language)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Audio & TTS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Music className="w-5 h-5 mr-2 text-emerald-500" />
            {t("settings.audioTts", language)}
          </CardTitle>
          <CardDescription>{t("settings.audioTtsDesc", language)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ApiKeyInput
            id="elevenlabs"
            label={t("settings.elevenlabs", language)}
            value={elevenlabsApiKey}
            onChange={setElevenlabsApiKey}
            placeholder={t("settings.elevenlabsPlaceholder", language)}
            description={t("settings.elevenlabsDesc", language)}
          />
        </CardContent>
      </Card>

      {/* 4. Platform Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Globe className="w-5 h-5 mr-2 text-orange-500" />
            {t("settings.platformIntegration", language)}
          </CardTitle>
          <CardDescription>
            {t("settings.platformIntegrationDesc", language)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ApiKeyInput
            id="douyin"
            label={t("settings.douyinOpenApi", language)}
            value={douyinOpenApiKey}
            onChange={setDouyinOpenApiKey}
            placeholder={t("settings.douyinOpenApiPlaceholder", language)}
            description={t("settings.douyinOpenApiDesc", language)}
          />
          <div className="space-y-2">
            <Label htmlFor="douyin-base-url" className="text-sm font-medium">
              {t("settings.douyinBaseUrl", language)}
            </Label>
            <Input
              id="douyin-base-url"
              value={douyinOpenApiBaseUrl}
              onChange={(e) => setDouyinOpenApiBaseUrl(e.target.value)}
              placeholder={t("settings.douyinBaseUrlPlaceholder", language)}
            />
          </div>
          <Separator />
          <ApiKeyInput
            id="xiaohongshu"
            label="小红书企业 API Key"
            value={xiaohongshuApiKey}
            onChange={setXiaohongshuApiKey}
            placeholder="xhs-appkey-..."
            description="小红书开放平台企业 API，用于解析视频素材和账号数据"
          />
          <Separator />
          <ApiKeyInput
            id="bilibili-key"
            label="B站开放平台 App Key"
            value={bilibiliApiKey}
            onChange={setBilibiliApiKey}
            placeholder="bilibili-app-key-..."
            description="B站开放平台应用的 App Key"
          />
          <ApiKeyInput
            id="bilibili-secret"
            label="B站开放平台 App Secret"
            value={bilibiliApiSecret}
            onChange={setBilibiliApiSecret}
            placeholder="bilibili-app-secret-..."
            description="B站开放平台应用的 App Secret，与 App Key 配对使用"
          />
        </CardContent>
      </Card>

      {/* 5. Custom APIs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Key className="w-5 h-5 mr-2 text-pink-500" />
            {t("settings.customApis", language)}
          </CardTitle>
          <CardDescription>{t("settings.customApisDesc", language)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {customApis.map((api, index) => (
            <div key={api.id}>
              {index > 0 && <Separator className="mb-6" />}
              <div className="space-y-4 relative">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">
                    #{index + 1}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs"
                    onClick={() => removeCustomApi(api.id)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    {t("settings.removeApi", language)}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      {t("settings.customApiName", language)}
                    </Label>
                    <Input
                      value={api.name}
                      onChange={(e) => updateCustomApi(api.id, { name: e.target.value })}
                      placeholder={t("settings.customApiNamePlaceholder", language)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      {t("settings.customApiKey", language)}
                    </Label>
                    <Input
                      type="password"
                      value={api.key}
                      onChange={(e) => updateCustomApi(api.id, { key: e.target.value })}
                      placeholder={t("settings.customApiKeyPlaceholder", language)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      {t("settings.customApiBaseUrl", language)}
                    </Label>
                    <Input
                      value={api.baseUrl}
                      onChange={(e) => updateCustomApi(api.id, { baseUrl: e.target.value })}
                      placeholder={t("settings.customApiBaseUrlPlaceholder", language)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      {t("settings.customApiDescription", language)}
                    </Label>
                    <Input
                      value={api.description}
                      onChange={(e) => updateCustomApi(api.id, { description: e.target.value })}
                      placeholder={t("settings.customApiDescriptionPlaceholder", language)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={addCustomApi}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t("settings.addCustomApi", language)}
          </Button>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2 pb-8">
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="w-4 h-4 mr-2" />
          {t("settings.reset", language)}
        </Button>
        <Button size="lg" onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" />
          {t("settings.save", language)}
        </Button>
      </div>
    </div>
  );
}
