import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  // Transcription
  transcribe: (audioFilePath: string, options?: { language?: string; model?: string }) =>
    ipcRenderer.invoke('transcription:start', audioFilePath, options),
  getModels: () => ipcRenderer.invoke('transcription:get-models'),
  downloadModel: (modelName: string) => ipcRenderer.invoke('transcription:download-model', modelName),
  onDownloadProgress: (callback: (progress: number) => void) => {
    const handler = (_event: any, progress: number) => callback(progress);
    ipcRenderer.on('transcription:download-progress', handler);
    return () => ipcRenderer.removeListener('transcription:download-progress', handler);
  },
  onTranscriptionProgress: (callback: (progress: number) => void) => {
    const handler = (_event: any, progress: number) => callback(progress);
    ipcRenderer.on('transcription:progress', handler);
    return () => ipcRenderer.removeListener('transcription:progress', handler);
  },
  exportTranscription: (data: any) => ipcRenderer.invoke('transcription:export', data),
  importTranscription: () => ipcRenderer.invoke('transcription:import'),

  // Ollama
  checkOllama: () => ipcRenderer.invoke('ollama:check'),
  listOllamaModels: () => ipcRenderer.invoke('ollama:list-models'),
  generatePV: (transcription: string, modelName: string) =>
    ipcRenderer.invoke('ollama:generate-pv', transcription, modelName),
  onPVGenerationProgress: (callback: (text: string) => void) => {
    const handler = (_event: any, text: string) => callback(text);
    ipcRenderer.on('ollama:pv-progress', handler);
    return () => ipcRenderer.removeListener('ollama:pv-progress', handler);
  },
  setOllamaUrl: (url: string) => ipcRenderer.invoke('ollama:set-url', url),
  pullOllamaModel: (modelName: string) => ipcRenderer.invoke('ollama:pull-model', modelName),
  deleteOllamaModel: (modelName: string) => ipcRenderer.invoke('ollama:delete-model', modelName),
  onOllamaPullProgress: (callback: (data: { status: string; completed: number; total: number }) => void) => {
    const handler = (_event: any, data: { status: string; completed: number; total: number }) => callback(data);
    ipcRenderer.on('ollama:pull-progress', handler);
    return () => ipcRenderer.removeListener('ollama:pull-progress', handler);
  },
  getOllamaStatus: () => ipcRenderer.invoke('ollama:status'),

  // Dialogs
  openAudioFile: () => ipcRenderer.invoke('dialog:open-audio-file'),
  openTemplateFile: () => ipcRenderer.invoke('dialog:open-template-file'),
  saveDocument: () => ipcRenderer.invoke('dialog:save-document'),

  // Template
  loadTemplate: (filePath: string) => ipcRenderer.invoke('template:load', filePath),
  getPlaceholders: (filePath: string) => ipcRenderer.invoke('template:get-placeholders', filePath),

  // Document generation
  generateDocument: (pvContent: any, outputPath: string, templatePath?: string) =>
    ipcRenderer.invoke('document:generate', pvContent, outputPath, templatePath),

  // Store
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
  getRecentSessions: () => ipcRenderer.invoke('store:get-recent-sessions'),
  saveSession: (session: any) => ipcRenderer.invoke('store:save-session', session),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
