import { create } from 'zustand';
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
  | 'completed'
  | 'failed';

export type TaskType = 'render' | 'analyze' | 'crawl' | 'pipeline';

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
    completed: 'completed',
    failed: 'failed',
  };
  return map[s] || 'pending';
}
