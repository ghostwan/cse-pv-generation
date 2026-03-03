import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { app } from 'electron';
import https from 'https';
import http from 'http';

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

const MODELS_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

const AVAILABLE_MODELS: { name: string; size: string; filename: string }[] = [
  { name: 'tiny', size: '75 MB', filename: 'ggml-tiny.bin' },
  { name: 'base', size: '142 MB', filename: 'ggml-base.bin' },
  { name: 'small', size: '466 MB', filename: 'ggml-small.bin' },
  { name: 'medium', size: '1.5 GB', filename: 'ggml-medium.bin' },
  { name: 'large', size: '3.1 GB', filename: 'ggml-large-v3.bin' },
];

function getEmbeddedFfmpegPath(): string {
  // ffmpeg-static provides the path to the binary
  let ffmpegPath: string = require('ffmpeg-static');

  // In packaged app, the binary is extracted from asar via asarUnpack
  if (app.isPackaged) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }

  return ffmpegPath;
}

export class TranscriptionService {
  private modelsPath: string;

  constructor(modelsPath: string) {
    this.modelsPath = modelsPath;
    if (!fs.existsSync(this.modelsPath)) {
      fs.mkdirSync(this.modelsPath, { recursive: true });
    }
  }

  async getAvailableModels(): Promise<ModelInfo[]> {
    return AVAILABLE_MODELS.map((model) => {
      const modelPath = path.join(this.modelsPath, model.filename);
      return {
        name: model.name,
        size: model.size,
        downloaded: fs.existsSync(modelPath),
        path: modelPath,
      };
    });
  }

  async downloadModel(modelName: string, onProgress?: (progress: number) => void): Promise<void> {
    const model = AVAILABLE_MODELS.find((m) => m.name === modelName);
    if (!model) {
      throw new Error(`Modèle inconnu: ${modelName}`);
    }

    const modelPath = path.join(this.modelsPath, model.filename);
    if (fs.existsSync(modelPath)) {
      return;
    }

    const url = `${MODELS_BASE_URL}/${model.filename}`;

    return new Promise((resolve, reject) => {
      const downloadWithRedirect = (downloadUrl: string) => {
        const protocol = downloadUrl.startsWith('https') ? https : http;
        protocol.get(downloadUrl, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              downloadWithRedirect(redirectUrl);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Erreur de téléchargement: HTTP ${response.statusCode}`));
            return;
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedSize = 0;

          const fileStream = fs.createWriteStream(modelPath);
          response.pipe(fileStream);

          response.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length;
            if (totalSize > 0 && onProgress) {
              onProgress(Math.round((downloadedSize / totalSize) * 100));
            }
          });

          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });

          fileStream.on('error', (err) => {
            fs.unlinkSync(modelPath);
            reject(err);
          });
        }).on('error', reject);
      };

      downloadWithRedirect(url);
    });
  }

  async transcribe(audioFilePath: string, options?: { language?: string; model?: string }): Promise<TranscriptionResult> {
    const modelName = options?.model || 'base';
    const language = options?.language || 'fr';

    const model = AVAILABLE_MODELS.find((m) => m.name === modelName);
    if (!model) {
      throw new Error(`Modèle inconnu: ${modelName}`);
    }

    const modelPath = path.join(this.modelsPath, model.filename);
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Le modèle ${modelName} n'est pas téléchargé. Veuillez le télécharger d'abord.`);
    }

    // Convert audio to WAV 16kHz mono if needed
    const wavPath = await this.convertToWav(audioFilePath);

    try {
      // Use whisper-node for transcription
      const whisper = require('whisper-node').default;

      const result = await whisper(wavPath, {
        modelPath: modelPath,
        language: language,
        wordTimestamps: true,
      });

      const segments: TranscriptionSegment[] = (result || []).map((segment: any) => ({
        start: this.formatTimestamp(segment.start),
        end: this.formatTimestamp(segment.end),
        speech: segment.speech?.trim() || '',
      }));

      const fullText = segments.map((s) => s.speech).join(' ');

      return { segments, fullText };
    } finally {
      // Cleanup temp wav file if we created one
      if (wavPath !== audioFilePath && fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath);
      }
    }
  }

  private formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private async convertToWav(inputPath: string): Promise<string> {
    const ext = path.extname(inputPath).toLowerCase();
    if (ext === '.wav') {
      return inputPath;
    }

    const outputPath = inputPath.replace(/\.[^.]+$/, '_converted.wav');
    const ffmpegBin = getEmbeddedFfmpegPath();

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegBin, [
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        '-y',
        outputPath,
      ]);

      let stderr = '';
      ffmpeg.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(
            `Impossible de convertir le fichier audio (code ${code}).\n${stderr.slice(-500)}`
          ));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(
          `Erreur lors du lancement de ffmpeg embarqué: ${err.message}`
        ));
      });
    });
  }
}
