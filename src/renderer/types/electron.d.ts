export interface TranscriptionSegment {
  start: string;
  end: string;
  speech: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  fullText: string;
}

export interface ModelInfo {
  name: string;
  size: string;
  downloaded: boolean;
  path: string;
}

export interface TemplateInfo {
  path: string;
  name: string;
  placeholders: string[];
  size: number;
}

export interface Session {
  id: string;
  date: string;
  title: string;
  transcription: string;
  templatePath?: string;
  outputPath?: string;
}

export interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TranscriptionExport {
  version: number;
  exportedAt: string;
  sessionTitle: string;
  audioFileName?: string;
  segments: TranscriptionSegment[];
  fullText: string;
}

export interface ElectronAPI {
  transcribe: (audioFilePath: string, options?: { language?: string; model?: string }) => Promise<IpcResponse<TranscriptionResult>>;
  getModels: () => Promise<IpcResponse<ModelInfo[]>>;
  downloadModel: (modelName: string) => Promise<IpcResponse>;
  onDownloadProgress: (callback: (progress: number) => void) => () => void;
  onTranscriptionProgress: (callback: (progress: number) => void) => () => void;
  exportTranscription: (data: TranscriptionExport) => Promise<IpcResponse<string>>;
  importTranscription: () => Promise<IpcResponse<TranscriptionExport>>;
  openAudioFile: () => Promise<string | null>;
  openTemplateFile: () => Promise<string | null>;
  saveDocument: () => Promise<string | null>;
  loadTemplate: (filePath: string) => Promise<IpcResponse<TemplateInfo>>;
  getPlaceholders: (filePath: string) => Promise<IpcResponse<string[]>>;
  generateDocument: (templatePath: string, data: Record<string, any>, outputPath: string) => Promise<IpcResponse<string>>;
  storeGet: (key: string) => Promise<any>;
  storeSet: (key: string, value: any) => Promise<void>;
  getRecentSessions: () => Promise<Session[]>;
  saveSession: (session: any) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
