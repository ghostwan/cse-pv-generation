import path from 'path';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
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
  let ffmpegPath: string = require('ffmpeg-static');
  if (app.isPackaged) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
  return ffmpegPath;
}

function getWhisperCppPath(): string {
  // whisper-node ships a compiled whisper.cpp binary
  const whisperNodePath = require.resolve('whisper-node');
  const whisperCppDir = path.join(path.dirname(whisperNodePath), '..', 'lib', 'whisper.cpp');
  let mainBin = path.join(whisperCppDir, 'main');

  if (app.isPackaged) {
    mainBin = mainBin.replace('app.asar', 'app.asar.unpacked');
  }

  return mainBin;
}

function getWhisperCppDir(): string {
  const whisperNodePath = require.resolve('whisper-node');
  let dir = path.join(path.dirname(whisperNodePath), '..', 'lib', 'whisper.cpp');
  if (app.isPackaged) {
    dir = dir.replace('app.asar', 'app.asar.unpacked');
  }
  return dir;
}

function ensureWhisperBuilt(): void {
  const mainBin = getWhisperCppPath();
  if (!fs.existsSync(mainBin)) {
    console.log('[transcription] whisper.cpp binary not found, attempting to build...');
    const whisperDir = getWhisperCppDir();
    try {
      execSync('make', { cwd: whisperDir, stdio: 'pipe' });
      console.log('[transcription] whisper.cpp built successfully');
    } catch (err: any) {
      throw new Error(
        `whisper.cpp n'a pas pu être compilé. Assurez-vous que Xcode Command Line Tools (macOS) ou build-essential (Linux) est installé.\n${err.message}`
      );
    }
  }
}

export class TranscriptionService {
  private modelsPath: string;

  constructor(modelsPath: string) {
    this.modelsPath = modelsPath;
    if (!fs.existsSync(this.modelsPath)) {
      fs.mkdirSync(this.modelsPath, { recursive: true });
    }
    // Ensure whisper.cpp binary is built
    try {
      ensureWhisperBuilt();
    } catch (err) {
      console.error('[transcription] Warning:', err);
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
      // Call whisper.cpp binary directly (more reliable than whisper-node wrapper)
      const whisperBin = getWhisperCppPath();
      const whisperDir = getWhisperCppDir();

      console.log(`[transcription] Using binary: ${whisperBin}`);
      console.log(`[transcription] Model: ${modelPath}`);
      console.log(`[transcription] Audio: ${wavPath}`);

      const output = await this.runWhisperCpp(whisperBin, whisperDir, modelPath, wavPath, language);
      const segments = this.parseWhisperOutput(output);
      const fullText = segments
        .map((s) => s.speech)
        .filter((s) => s.length > 0)
        .join(' ');

      return { segments, fullText };
    } finally {
      // Cleanup temp wav file if we created one
      if (wavPath !== audioFilePath && fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath);
      }
    }
  }

  private runWhisperCpp(
    binaryPath: string,
    cwd: string,
    modelPath: string,
    audioPath: string,
    language: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-l', language,
        '--print-progress', 'false',
      ];

      console.log(`[transcription] Running: ${binaryPath} ${args.join(' ')}`);

      const proc = spawn(binaryPath, args, {
        cwd,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        // Log progress lines from whisper.cpp
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.includes('progress')) {
            console.log(`[transcription] ${line.trim()}`);
          }
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          console.error(`[transcription] stderr: ${stderr.slice(-1000)}`);
          reject(new Error(`whisper.cpp a échoué (code ${code}): ${stderr.slice(-500)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Impossible de lancer whisper.cpp: ${err.message}`));
      });
    });
  }

  private parseWhisperOutput(output: string): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = [];
    // Parse lines like: [00:00:00.000 --> 00:00:02.000]   Allô !
    const regex = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)/g;
    let match;

    while ((match = regex.exec(output)) !== null) {
      const speech = match[3].trim();
      if (speech && speech !== '.' && speech !== '*' && !speech.match(/^\*+$/)) {
        segments.push({
          start: match[1].substring(0, 8), // HH:MM:SS
          end: match[2].substring(0, 8),
          speech,
        });
      }
    }

    return segments;
  }

  private async convertToWav(inputPath: string): Promise<string> {
    const ext = path.extname(inputPath).toLowerCase();
    if (ext === '.wav') {
      return inputPath;
    }

    const outputPath = inputPath.replace(/\.[^.]+$/, '_converted.wav');

    // Skip conversion if already converted
    if (fs.existsSync(outputPath)) {
      console.log(`[transcription] Using existing converted file: ${outputPath}`);
      return outputPath;
    }

    const ffmpegBin = getEmbeddedFfmpegPath();
    console.log(`[transcription] Converting audio with ffmpeg: ${ffmpegBin}`);

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
          console.log(`[transcription] Audio converted: ${outputPath}`);
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
