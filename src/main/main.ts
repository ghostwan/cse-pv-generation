import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { TranscriptionService } from './services/transcription';
import { TemplateService } from './services/template';
import { DocumentGenerator } from './services/documentGenerator';
import { StoreService } from './services/store';

let mainWindow: BrowserWindow | null = null;
let transcriptionService: TranscriptionService;
let templateService: TemplateService;
let documentGenerator: DocumentGenerator;
let storeService: StoreService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    title: 'CSE PV Generation',
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initializeServices() {
  const modelsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(__dirname, '../../models');

  transcriptionService = new TranscriptionService(modelsPath);
  templateService = new TemplateService();
  documentGenerator = new DocumentGenerator();
  storeService = new StoreService();
}

function registerIpcHandlers() {
  // Transcription handlers
  ipcMain.handle('transcription:start', async (_event, audioFilePath: string, options?: { language?: string; model?: string }) => {
    try {
      const result = await transcriptionService.transcribe(audioFilePath, options);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transcription:get-models', async () => {
    try {
      const models = await transcriptionService.getAvailableModels();
      return { success: true, data: models };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transcription:download-model', async (_event, modelName: string) => {
    try {
      await transcriptionService.downloadModel(modelName, (progress: number) => {
        mainWindow?.webContents.send('transcription:download-progress', progress);
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // File dialog handlers
  ipcMain.handle('dialog:open-audio-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Fichiers Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'wma', 'webm'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-template-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [
        { name: 'Documents Word', extensions: ['docx'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:save-document', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      filters: [
        { name: 'Document Word', extensions: ['docx'] },
      ],
      defaultPath: `PV_CSE_${new Date().toISOString().split('T')[0]}.docx`,
    });
    return result.canceled ? null : result.filePath;
  });

  // Template handlers
  ipcMain.handle('template:load', async (_event, filePath: string) => {
    try {
      const templateInfo = await templateService.loadTemplate(filePath);
      return { success: true, data: templateInfo };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('template:get-placeholders', async (_event, filePath: string) => {
    try {
      const placeholders = await templateService.getPlaceholders(filePath);
      return { success: true, data: placeholders };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Document generation handlers
  ipcMain.handle('document:generate', async (_event, templatePath: string, data: Record<string, any>, outputPath: string) => {
    try {
      await documentGenerator.generate(templatePath, data, outputPath);
      return { success: true, data: outputPath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Store handlers
  ipcMain.handle('store:get', async (_event, key: string) => {
    return storeService.get(key);
  });

  ipcMain.handle('store:set', async (_event, key: string, value: any) => {
    storeService.set(key, value);
  });

  ipcMain.handle('store:get-recent-sessions', async () => {
    return storeService.getRecentSessions();
  });

  ipcMain.handle('store:save-session', async (_event, session: any) => {
    storeService.saveSession(session);
  });
}

app.whenReady().then(() => {
  initializeServices();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
