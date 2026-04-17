import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Language } from './i18n';

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'generating_script'
  | 'generating_audio'
  | 'gathering_visuals'
  | 'rendering'
  | 'analyzing'
  | 'crawling'
  | 'pipeline_analyzing'
  | 'pipeline_fetching'
  | 'pipeline_rendering'
  | 'transcribing'
  | 'video_analyzing'
  | 'beat_analyzing'
  | 'auto_editing'
  | 'completed'
  | 'failed';

export type TaskType = 'render' | 'analyze' | 'crawl' | 'pipeline' | 'transcribe' | 'video_analyze' | 'beat_analyze' | 'auto_edit';

export interface VideoTask {
  id: string;
  topic: string;
  status: TaskStatus;
  progress: number;
  createdAt: number;
  videoUrl?: string;
  script?: string;
  error?: string;
  // New fields for backend integration
  projectId?: string;
  type?: TaskType;
  resultUrl?: string;
  resultJson?: string;
}

interface TaskStore {
  language: Language;
  setLanguage: (lang: Language) => void;
  tasks: VideoTask[];
  addTask: (task: VideoTask) => void;
  updateTask: (id: string, updates: Partial<VideoTask>) => void;
  removeTask: (id: string) => void;
  setTasks: (tasks: VideoTask[]) => void;
  // Backend API helpers
  fetchTasks: () => Promise<void>;
  pollTaskStatus: (taskId: string) => Promise<VideoTask | null>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  language: 'en',
  setLanguage: (lang) => set({ language: lang }),
  tasks: [],
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  })),
  removeTask: (id) => set((state) => ({
    tasks: state.tasks.filter((t) => t.id !== id),
  })),
  setTasks: (tasks) => set({ tasks }),

  fetchTasks: async () => {
    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) return;
      const rows = await res.json();
      const tasks: VideoTask[] = rows.map((r: any) => ({
        id: r.id,
        topic: r.payload_json ? (JSON.parse(r.payload_json).topic || r.type || '') : (r.type || ''),
        status: mapBackendStatus(r.status),
        progress: r.progress || 0,
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
        projectId: r.project_id,
        type: r.type as TaskType,
        resultUrl: r.result_url || undefined,
        error: r.error || undefined,
      }));
      set({ tasks });
    } catch (e) {
      console.error('[Store] fetchTasks error:', e);
    }
  },

  pollTaskStatus: async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) return null;
      const data = await res.json();
      const status = mapBackendStatus(data.status);
      const updates: Partial<VideoTask> = {
        status,
        progress: data.progress || 0,
        resultUrl: data.result_url || undefined,
        resultJson: data.result_json || undefined,
        error: data.error || undefined,
      };
      get().updateTask(taskId, updates);
      return { ...updates, id: taskId } as VideoTask;
    } catch (e) {
      console.error('[Store] pollTaskStatus error:', e);
      return null;
    }
  },
}));

/** Map backend status strings to frontend TaskStatus */
function mapBackendStatus(s: string): TaskStatus {
  const map: Record<string, TaskStatus> = {
    queued: 'queued',
    processing: 'rendering',
    rendering: 'rendering',
    analyzing: 'analyzing',
    crawling: 'crawling',
    pipeline_analyzing: 'pipeline_analyzing',
    pipeline_fetching: 'pipeline_fetching',
    pipeline_rendering: 'pipeline_rendering',
    transcribing: 'transcribing',
    video_analyzing: 'video_analyzing',
    beat_analyzing: 'beat_analyzing',
    auto_editing: 'auto_editing',
    completed: 'completed',
    failed: 'failed',
  };
  return map[s] || 'pending';
}

// --------------------------------------------------------------------------- #
// Draft Store — persisted form state for NewProject                            #
// File objects can't be serialised, so we store metadata only and the user    //
// must re-select files after a page reload. URL / config fields survive.       //
// --------------------------------------------------------------------------- #

export interface MediaFileMeta {
  name: string;
  size: number;
  type: string;   // MIME type
}

interface DraftState {
  // Material metadata (survives page switch, not full file reload)
  mediaFileMetas: MediaFileMeta[];
  referenceUrl: string;
  audioFileName: string | null;
  // Config
  aspectRatio: string;
  duration: number;
  template: string;
  // API
  selectedProvider: string;
  apiKey: string;
  customBaseUrl: string;
  customModel: string;
  // Actions
  setMediaFileMetas: (metas: MediaFileMeta[]) => void;
  setReferenceUrl: (url: string) => void;
  setAudioFileName: (name: string | null) => void;
  setAspectRatio: (ratio: string) => void;
  setDuration: (dur: number) => void;
  setTemplate: (tpl: string) => void;
  setSelectedProvider: (id: string) => void;
  setApiKey: (key: string) => void;
  setCustomBaseUrl: (url: string) => void;
  setCustomModel: (model: string) => void;
  clearDraft: () => void;
}

const DRAFT_INITIAL = {
  mediaFileMetas: [] as MediaFileMeta[],
  referenceUrl: '',
  audioFileName: null as string | null,
  aspectRatio: '9:16',
  duration: 30,
  template: 'vlog',
  selectedProvider: 'zhipu',
  apiKey: '',
  customBaseUrl: '',
  customModel: '',
};

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      ...DRAFT_INITIAL,
      setMediaFileMetas: (metas) => set({ mediaFileMetas: metas }),
      setReferenceUrl:   (url)   => set({ referenceUrl: url }),
      setAudioFileName:  (name)  => set({ audioFileName: name }),
      setAspectRatio:    (ratio) => set({ aspectRatio: ratio }),
      setDuration:       (dur)   => set({ duration: dur }),
      setTemplate:       (tpl)   => set({ template: tpl }),
      setSelectedProvider: (id)  => set({ selectedProvider: id }),
      setApiKey:         (key)   => set({ apiKey: key }),
      setCustomBaseUrl:  (url)   => set({ customBaseUrl: url }),
      setCustomModel:    (model) => set({ customModel: model }),
      clearDraft: () => set(DRAFT_INITIAL),
    }),
    { name: 'videoturbo-draft' }
  )
);
