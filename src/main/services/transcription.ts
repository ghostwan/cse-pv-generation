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

  async transcribe(
    audioFilePath: string,
    options?: { language?: string; model?: string },
    onProgress?: (progress: number) => void
  ): Promise<TranscriptionResult> {
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

    // Step 1: Convert audio
    onProgress?.(0);
    const wavPath = await this.convertToWav(audioFilePath);

    // Step 2: Get audio duration for progress calculation
    const durationSeconds = await this.getAudioDuration(wavPath);
    console.log(`[transcription] Audio duration: ${durationSeconds}s`);
    onProgress?.(2);

    try {
      // Step 3: Run whisper.cpp with real-time progress
      const whisperBin = getWhisperCppPath();
      const whisperDir = getWhisperCppDir();

      console.log(`[transcription] Using binary: ${whisperBin}`);
      console.log(`[transcription] Model: ${modelPath}`);
      console.log(`[transcription] Audio: ${wavPath}`);

      const output = await this.runWhisperCpp(
        whisperBin, whisperDir, modelPath, wavPath, language,
        durationSeconds, onProgress
      );

      const segments = this.parseWhisperOutput(output);
      const fullText = segments
        .map((s) => s.speech)
        .filter((s) => s.length > 0)
        .join(' ');

      onProgress?.(100);
      return { segments, fullText };
    } finally {
      if (wavPath !== audioFilePath && fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath);
      }
    }
  }

  private getAudioDuration(wavPath: string): Promise<number> {
    return new Promise((resolve) => {
      const ffmpegBin = getEmbeddedFfmpegPath();
      const proc = spawn(ffmpegBin, ['-i', wavPath, '-f', 'null', '-']);

      let stderr = '';
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', () => {
        // Parse duration from ffmpeg output: "Duration: HH:MM:SS.ms"
        const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (match) {
          const hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const seconds = parseInt(match[3], 10);
          resolve(hours * 3600 + minutes * 60 + seconds);
        } else {
          // Fallback: estimate from WAV file size (16kHz, 16-bit, mono = 32000 bytes/sec)
          try {
            const stats = fs.statSync(wavPath);
            resolve(Math.floor((stats.size - 44) / 32000)); // subtract WAV header
          } catch {
            resolve(0);
          }
        }
      });

      proc.on('error', () => {
        resolve(0);
      });
    });
  }

  private runWhisperCpp(
    binaryPath: string,
    cwd: string,
    modelPath: string,
    audioPath: string,
    language: string,
    totalDurationSeconds: number,
    onProgress?: (progress: number) => void
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
      let lastProgress = 2;

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;

        // Calculate progress from the latest timestamp in stdout
        if (totalDurationSeconds > 0 && onProgress) {
          const timestampRegex = /\[(\d{2}):(\d{2}):(\d{2})\.\d{3}\s*-->/g;
          let match;
          let latestSeconds = 0;
          while ((match = timestampRegex.exec(stdout)) !== null) {
            const s = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
            if (s > latestSeconds) latestSeconds = s;
          }
          // Map to 2-98% range (0-2% is conversion, 98-100% is finalization)
          const pct = Math.min(98, Math.floor(2 + (latestSeconds / totalDurationSeconds) * 96));
          if (pct > lastProgress) {
            lastProgress = pct;
            onProgress(pct);
          }
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
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
    const regex = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)/g;
    let match;

    while ((match = regex.exec(output)) !== null) {
      const speech = match[3].trim();
      if (speech && speech !== '.' && speech !== '*' && !speech.match(/^\*+$/)) {
        segments.push({
          start: match[1].substring(0, 8),
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
