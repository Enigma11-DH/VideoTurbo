import { create } from 'zustand';
import { Language } from './i18n';

export type TaskStatus = 'pending' | 'generating_script' | 'generating_audio' | 'gathering_visuals' | 'rendering' | 'completed' | 'failed';

export interface VideoTask {
  id: string;
  topic: string;
  status: TaskStatus;
  progress: number;
  createdAt: number;
  videoUrl?: string;
  script?: string;
  error?: string;
}

interface TaskStore {
  language: Language;
  setLanguage: (lang: Language) => void;
  tasks: VideoTask[];
  addTask: (task: VideoTask) => void;
  updateTask: (id: string, updates: Partial<VideoTask>) => void;
  removeTask: (id: string) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
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
}));
