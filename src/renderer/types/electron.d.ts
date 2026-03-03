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

export interface OllamaModel {
  name: string;
  size: number;
  details: { family: string; parameter_size: string };
}

export interface PVSection {
  titre: string;
  resume_direction: string;
  resume_cse: string;
  discussion: string;
}

export interface PVContent {
  titre: string;
  date: string;
  participants_direction: string[];
  participants_cse: string[];
  ordre_du_jour: string[];
  sections: PVSection[];
  decisions: string[];
  conclusion: string;
}

export interface ElectronAPI {
  // Transcription
  transcribe: (audioFilePath: string, options?: { language?: string; model?: string }) => Promise<IpcResponse<TranscriptionResult>>;
  getModels: () => Promise<IpcResponse<ModelInfo[]>>;
  downloadModel: (modelName: string) => Promise<IpcResponse>;
  onDownloadProgress: (callback: (progress: number) => void) => () => void;
  onTranscriptionProgress: (callback: (progress: number) => void) => () => void;
  exportTranscription: (data: TranscriptionExport) => Promise<IpcResponse<string>>;
  importTranscription: () => Promise<IpcResponse<TranscriptionExport>>;

  // Ollama
  checkOllama: () => Promise<IpcResponse<boolean>>;
  listOllamaModels: () => Promise<IpcResponse<OllamaModel[]>>;
  generatePV: (transcription: string, modelName: string) => Promise<IpcResponse<PVContent>>;
  onPVGenerationProgress: (callback: (text: string) => void) => () => void;
  setOllamaUrl: (url: string) => Promise<void>;
  pullOllamaModel: (modelName: string) => Promise<IpcResponse>;
  deleteOllamaModel: (modelName: string) => Promise<IpcResponse>;
  onOllamaPullProgress: (callback: (data: { status: string; completed: number; total: number }) => void) => () => void;
  getOllamaStatus: () => Promise<IpcResponse<{ running: boolean; binaryAvailable: boolean; baseUrl: string }>>;

  // Dialogs
  openAudioFile: () => Promise<string | null>;
  openTemplateFile: () => Promise<string | null>;
  saveDocument: () => Promise<string | null>;

  // Template
  loadTemplate: (filePath: string) => Promise<IpcResponse<TemplateInfo>>;
  getPlaceholders: (filePath: string) => Promise<IpcResponse<string[]>>;

  // Document generation
  generateDocument: (pvContent: PVContent, outputPath: string, templatePath?: string) => Promise<IpcResponse<string>>;

  // Store
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
