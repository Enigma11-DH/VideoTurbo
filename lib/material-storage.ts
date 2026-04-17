const STORAGE_KEY = "videoturbo_materials";
const CONFIG_KEY = "videoturbo_config";

export interface StoredMaterial {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  dataUrl?: string; // For small files (<5MB), store as base64
}

export interface StoredConfig {
  aspectRatio: string;
  duration: number;
  template: string;
  selectedProvider: string;
  customBaseUrl: string;
  customModel: string;
  timestamp: number;
}

export interface MaterialSession {
  mediaFiles: StoredMaterial[];
  audioFile: StoredMaterial | null;
  referenceUrl: string;
  config: StoredConfig;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function fileToStored(file: File): Promise<StoredMaterial> {
  return new Promise((resolve) => {
    const stored: StoredMaterial = {
      id: generateId(),
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    };

    // Only store dataUrl for files < 5MB to avoid localStorage overflow
    if (file.size < 5 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = () => {
        stored.dataUrl = reader.result as string;
        resolve(stored);
      };
      reader.onerror = () => {
        console.warn("[Storage] Failed to read file, storing metadata only");
        resolve(stored);
      };
      reader.readAsDataURL(file);
    } else {
      resolve(stored);
    }
  });
}

export function saveMaterials(session: Partial<MaterialSession>): void {
  try {
    const existing = loadMaterials();
    
    if (session.mediaFiles !== undefined) {
      existing.mediaFiles = session.mediaFiles;
    }
    if (session.audioFile !== undefined) {
      existing.audioFile = session.audioFile;
    }
    if (session.referenceUrl !== undefined) {
      existing.referenceUrl = session.referenceUrl;
    }
    if (session.config !== undefined) {
      existing.config = session.config;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    console.log(`[Storage] ✅ Saved ${existing.mediaFiles.length} media files, audio: ${!!existing.audioFile}`);
  } catch (error) {
    console.error("[Storage] ❌ Failed to save materials:", error);
    // If storage is full, try to remove dataUrls and keep only metadata
    try {
      const minimal = {
        ...loadMaterials(),
        mediaFiles: (session.mediaFiles || []).map(({ dataUrl, ...rest }) => rest),
        audioFile: session.audioFile ? { ...(session.audioFile as any).dataUrl, ...session.audioFile } : null,
      };
      // Remove dataUrl from audio too
      if (minimal.audioFile) {
        delete (minimal.audioFile as any).dataUrl;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
      console.warn("[Storage] ⚠️ Saved without file data (storage limit)");
    } catch (e) {
      console.error("[Storage] ❌ Completely failed to save:", e);
    }
  }
}

export function loadMaterials(): MaterialSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySession();
    
    const parsed = JSON.parse(raw);
    
    // Validate structure
    if (!parsed || typeof parsed !== 'object') return emptySession();
    
    return {
      mediaFiles: Array.isArray(parsed.mediaFiles) ? parsed.mediaFiles : [],
      audioFile: parsed.audioFile || null,
      referenceUrl: typeof parsed.referenceUrl === 'string' ? parsed.referenceUrl : '',
      config: parsed.config || defaultConfig(),
    };
  } catch (error) {
    console.error("[Storage] ❌ Failed to load materials:", error);
    return emptySession();
  }
}

export function clearMaterials(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("[Storage] 🗑️ Cleared all stored materials");
  } catch (error) {
    console.error("[Storage] ❌ Failed to clear materials:", error);
  }
}

export function getStorageSize(): { used: string; total: string; percentage: number } {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage[key].length + key.length;
    }
  }
  
  // Approximate localStorage limit (usually 5-10MB)
  const limit = 5 * 1024 * 1024; // 5MB
  const used = total;
  
  return {
    used: formatBytes(used),
    total: formatBytes(limit),
    percentage: Math.round((used / limit) * 100),
  };
}

export function hasStoredMaterials(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    
    const parsed = JSON.parse(raw);
    return parsed && (
      (Array.isArray(parsed.mediaFiles) && parsed.mediaFiles.length > 0) ||
      parsed.audioFile ||
      (parsed.referenceUrl && parsed.referenceUrl.trim().length > 0)
    );
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function emptySession(): MaterialSession {
  return {
    mediaFiles: [],
    audioFile: null,
    referenceUrl: '',
    config: defaultConfig(),
  };
}

function defaultConfig(): StoredConfig {
  return {
    aspectRatio: '9:16',
    duration: 30,
    template: 'vlog',
    selectedProvider: 'zhipu',
    customBaseUrl: '',
    customModel: '',
    timestamp: Date.now(),
  };
}
