import { app, BrowserWindow, ipcMain, dialog, session, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { TranscriptionService } from './services/transcription';
import { TemplateService } from './services/template';
import { DocumentGenerator } from './services/documentGenerator';
import { StoreService } from './services/store';
import { OllamaService } from './services/ollama';
import { OllamaManager } from './services/ollamaManager';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let transcriptionService: TranscriptionService;
let templateService: TemplateService;
let documentGenerator: DocumentGenerator;
let storeService: StoreService;
let ollamaService: OllamaService;
let ollamaManager: OllamaManager;

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

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    console.log(`[main] Loading dev server: ${devUrl}`);
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[main] Failed to load: ${errorDescription} (${errorCode})`);
    if (isDev) {
      console.log('[main] Retrying in 2 seconds...');
      setTimeout(() => {
        const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
        mainWindow?.loadURL(devUrl);
      }, 2000);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initializeServices() {
  const modelsPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'models')
    : path.join(__dirname, '../../models');

  transcriptionService = new TranscriptionService(modelsPath);
  templateService = new TemplateService();
  documentGenerator = new DocumentGenerator();
  storeService = new StoreService();

  // Initialize embedded Ollama manager
  ollamaManager = new OllamaManager();

  // OllamaService uses the embedded server's URL
  ollamaService = new OllamaService(ollamaManager.baseUrl);
}

async function startEmbeddedOllama() {
  if (!ollamaManager.isBinaryAvailable()) {
    console.warn('[main] Ollama binary not found — embedded Ollama unavailable');
    return;
  }

  try {
    await ollamaManager.start();
    // Point OllamaService at the embedded server
    ollamaService.setBaseUrl(ollamaManager.baseUrl);
    console.log('[main] Embedded Ollama started successfully');
  } catch (error: any) {
    console.error('[main] Failed to start embedded Ollama:', error.message);
  }
}

function registerIpcHandlers() {
  // Transcription handlers
  ipcMain.handle('transcription:start', async (_event, audioFilePath: string, options?: { language?: string; model?: string }) => {
    try {
      const result = await transcriptionService.transcribe(audioFilePath, options, (progress: number) => {
        mainWindow?.webContents.send('transcription:progress', progress);
      });

      const segmentCount = result.segments.length;
      new Notification({
        title: 'Transcription terminee',
        body: `${segmentCount} segment${segmentCount > 1 ? 's' : ''} transcrit${segmentCount > 1 ? 's' : ''} avec succes.`,
      }).show();

      return { success: true, data: result };
    } catch (error: any) {
      new Notification({
        title: 'Erreur de transcription',
        body: error.message.substring(0, 200),
      }).show();

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

  // Transcription export/import handlers
  ipcMain.handle('transcription:export', async (_event, data: any) => {
    try {
      const defaultName = data.sessionTitle
        ? `${data.sessionTitle.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ _-]/g, '')}.json`
        : `transcription_${new Date().toISOString().split('T')[0]}.json`;
      const result = await dialog.showSaveDialog(mainWindow!, {
        filters: [{ name: 'Transcription JSON', extensions: ['json'] }],
        defaultPath: defaultName,
      });
      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Export annule' };
      }
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { success: true, data: result.filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('transcription:import', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile'],
        filters: [{ name: 'Transcription JSON', extensions: ['json'] }],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Import annule' };
      }
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      const data = JSON.parse(content);
      if (!data.segments || !Array.isArray(data.segments) || typeof data.fullText !== 'string') {
        return { success: false, error: 'Fichier invalide : format de transcription non reconnu' };
      }
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Ollama handlers
  ipcMain.handle('ollama:check', async () => {
    try {
      const available = await ollamaService.isAvailable();
      return { success: true, data: available };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ollama:list-models', async () => {
    try {
      const models = await ollamaService.listModels();
      return { success: true, data: models };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ollama:generate-pv', async (_event, transcription: string, modelName: string) => {
    try {
      const pvContent = await ollamaService.generatePV(transcription, modelName, (text: string) => {
        mainWindow?.webContents.send('ollama:pv-progress', text);
      });

      new Notification({
        title: 'PV genere',
        body: `Le proces-verbal "${pvContent.titre}" a ete genere avec succes.`,
      }).show();

      return { success: true, data: pvContent };
    } catch (error: any) {
      new Notification({
        title: 'Erreur de generation',
        body: error.message.substring(0, 200),
      }).show();

      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ollama:set-url', async (_event, url: string) => {
    ollamaService.setBaseUrl(url);
    storeService.set('ollamaUrl', url);
  });

  // Ollama model pull/delete (via embedded manager)
  ipcMain.handle('ollama:pull-model', async (_event, modelName: string) => {
    try {
      await ollamaManager.pullModel(modelName, (status, completed, total) => {
        mainWindow?.webContents.send('ollama:pull-progress', { status, completed, total });
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ollama:delete-model', async (_event, modelName: string) => {
    try {
      await ollamaManager.deleteModel(modelName);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ollama:status', async () => {
    return {
      success: true,
      data: {
        running: ollamaManager.isRunning,
        binaryAvailable: ollamaManager.isBinaryAvailable(),
        baseUrl: ollamaManager.baseUrl,
      },
    };
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

  // Document generation handler
  ipcMain.handle('document:generate', async (_event, pvContent: any, outputPath: string, templatePath?: string) => {
    try {
      await documentGenerator.generateFromPV(pvContent, outputPath, templatePath);
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

  ipcMain.handle('store:save-session', async (_event, sessionData: any) => {
    storeService.saveSession(sessionData);
  });
}

app.whenReady().then(async () => {
  // Set CSP headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data:"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  initializeServices();
  registerIpcHandlers();
  createWindow();

  // Start embedded Ollama in the background (non-blocking)
  startEmbeddedOllama();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Stop embedded Ollama before quitting
app.on('before-quit', async () => {
  if (ollamaManager) {
    await ollamaManager.stop();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
