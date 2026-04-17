import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LlmConfig {
  id: string;
  name: string;     // 显示名称，如"我的千问"
  baseUrl: string;  // https://dashscope.aliyuncs.com/compatible-mode/v1
  apiKey: string;
  model: string;    // qwen-turbo
}

export interface CustomApiEntry {
  id: string;
  name: string;
  key: string;
  baseUrl: string;
  description: string;
}

// Built-in presets for quick-fill
export const LLM_PRESETS: Array<{ label: string; baseUrl: string; model: string }> = [
  { label: '智谱AI (Zhipu)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: '文心一言', baseUrl: 'https://qianfan.baidubce.com/v2', model: 'ernie-4.5-8k' },
  { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  { label: 'OpenAI',  baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
];

type ActionKeys =
  | 'setSettings'
  | 'addLlmConfig' | 'removeLlmConfig' | 'updateLlmConfig' | 'setActiveLlmId'
  | 'addCustomApi'  | 'removeCustomApi'  | 'updateCustomApi';

interface SettingsState {
  // AI LLM configs (replaces geminiApiKey)
  llmConfigs: LlmConfig[];
  activeLlmId: string;   // id of the LLM currently used for generation
  // Video & Media
  pexelsApiKey: string;
  capcutApiKey: string;
  capcutApiBaseUrl: string;
  // Audio / TTS
  elevenlabsApiKey: string;
  // Platform Integration
  douyinOpenApiKey: string;
  douyinOpenApiBaseUrl: string;
  xiaohongshuApiKey: string;
  bilibiliApiKey: string;
  bilibiliApiSecret: string;
  // Custom APIs
  customApis: CustomApiEntry[];
  // Actions
  setSettings: (settings: Partial<Omit<SettingsState, ActionKeys>>) => void;
  // LLM actions
  addLlmConfig: (entry: LlmConfig) => void;
  removeLlmConfig: (id: string) => void;
  updateLlmConfig: (id: string, updates: Partial<LlmConfig>) => void;
  setActiveLlmId: (id: string) => void;
  // Custom API actions
  addCustomApi: (entry: CustomApiEntry) => void;
  removeCustomApi: (id: string) => void;
  updateCustomApi: (id: string, updates: Partial<CustomApiEntry>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      llmConfigs: [],
      activeLlmId: '',
      pexelsApiKey: '',
      capcutApiKey: '',
      capcutApiBaseUrl: 'https://open.capcut.com',
      elevenlabsApiKey: '',
      douyinOpenApiKey: '',
      douyinOpenApiBaseUrl: '',
      xiaohongshuApiKey: '',
      bilibiliApiKey: '',
      bilibiliApiSecret: '',
      customApis: [],

      setSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),

      // LLM actions
      addLlmConfig: (entry) =>
        set((state) => ({ llmConfigs: [...state.llmConfigs, entry] })),
      removeLlmConfig: (id) =>
        set((state) => ({
          llmConfigs: state.llmConfigs.filter((c) => c.id !== id),
          activeLlmId: state.activeLlmId === id ? '' : state.activeLlmId,
        })),
      updateLlmConfig: (id, updates) =>
        set((state) => ({
          llmConfigs: state.llmConfigs.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),
      setActiveLlmId: (id) => set({ activeLlmId: id }),

      // Custom API actions
      addCustomApi: (entry) =>
        set((state) => ({ customApis: [...state.customApis, entry] })),
      removeCustomApi: (id) =>
        set((state) => ({ customApis: state.customApis.filter((a) => a.id !== id) })),
      updateCustomApi: (id, updates) =>
        set((state) => ({
          customApis: state.customApis.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        })),
    }),
    {
      name: 'videoturbo-settings',
    }
  )
);
