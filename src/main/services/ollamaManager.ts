import { ChildProcess, spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import http from 'http';

/**
 * Manages the embedded Ollama binary lifecycle.
 * - Starts ollama serve as a subprocess on app launch
 * - Uses a non-default port (11435) to avoid conflicts with user's own Ollama
 * - Stores models in userData/ollama-models
 * - Stops the process on app quit
 */
export class OllamaManager {
  private process: ChildProcess | null = null;
  private port = 11435;
  private _isRunning = false;
  private _logs: string[] = [];

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get logs(): string[] {
    return this._logs;
  }

  /**
   * Resolves the path to the embedded Ollama binary.
   */
  get binaryPath(): string {
    const platform = process.platform;

    if (app.isPackaged) {
      // In packaged app, binary is in resources/ollama/
      const resourcesPath = process.resourcesPath;
      if (platform === 'darwin') {
        return path.join(resourcesPath, 'ollama', 'ollama');
      } else if (platform === 'linux') {
        return path.join(resourcesPath, 'ollama', 'bin', 'ollama');
      } else if (platform === 'win32') {
        return path.join(resourcesPath, 'ollama', 'ollama.exe');
      }
    } else {
      // In development, __dirname = dist/main/services/, project root is 3 levels up
      const devBase = path.join(__dirname, '..', '..', '..', 'resources', 'ollama');
      if (platform === 'darwin') {
        return path.join(devBase, 'darwin', 'ollama');
      } else if (platform === 'linux') {
        const arch = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
        return path.join(devBase, arch, 'bin', 'ollama');
      } else if (platform === 'win32') {
        return path.join(devBase, 'win32-x64', 'ollama.exe');
      }
    }

    throw new Error(`Unsupported platform: ${platform}`);
  }

  /**
   * Path to the library directory containing GPU acceleration libs.
   * Ollama looks for libs relative to the binary.
   */
  get libraryPath(): string {
    const binPath = this.binaryPath;
    // On macOS, libs are in the same directory as the binary
    // On Linux, libs are in ../lib/ollama relative to the binary
    // On Windows, libs are in ./lib/ollama relative to the binary
    if (process.platform === 'linux') {
      return path.join(path.dirname(binPath), '..', 'lib', 'ollama');
    }
    return path.dirname(binPath);
  }

  /**
   * Models are stored in userData to persist across app updates.
   */
  get modelsPath(): string {
    return path.join(app.getPath('userData'), 'ollama-models');
  }

  /**
   * Check if the binary exists.
   */
  isBinaryAvailable(): boolean {
    try {
      return fs.existsSync(this.binaryPath);
    } catch {
      return false;
    }
  }

  /**
   * Start the embedded Ollama server.
   */
  async start(): Promise<void> {
    if (this._isRunning) {
      console.log('[ollama-manager] Already running');
      return;
    }

    const binPath = this.binaryPath;
    if (!fs.existsSync(binPath)) {
      throw new Error(`Ollama binary not found at: ${binPath}`);
    }

    // Ensure models directory exists
    fs.mkdirSync(this.modelsPath, { recursive: true });

    console.log(`[ollama-manager] Starting Ollama server...`);
    console.log(`[ollama-manager] Binary: ${binPath}`);
    console.log(`[ollama-manager] Models: ${this.modelsPath}`);
    console.log(`[ollama-manager] Port: ${this.port}`);

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      OLLAMA_HOST: `127.0.0.1:${this.port}`,
      OLLAMA_MODELS: this.modelsPath,
      OLLAMA_NO_CLOUD: '1',
      OLLAMA_NOPRUNE: '1',
    };

    this.process = spawn(binPath, ['serve'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.dirname(binPath),
    });

    // Capture logs
    this.process.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        this._logs.push(line);
        if (this._logs.length > 100) this._logs.shift();
        console.log(`[ollama] ${line}`);
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        this._logs.push(line);
        if (this._logs.length > 100) this._logs.shift();
        console.log(`[ollama] ${line}`);
      }
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[ollama-manager] Process exited (code=${code}, signal=${signal})`);
      this._isRunning = false;
      this.process = null;
    });

    this.process.on('error', (err) => {
      console.error(`[ollama-manager] Process error:`, err.message);
      this._isRunning = false;
    });

    // Wait for the server to be ready
    await this.waitForReady(30000);
    this._isRunning = true;
    console.log(`[ollama-manager] Server ready at ${this.baseUrl}`);
  }

  /**
   * Stop the Ollama server.
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    console.log('[ollama-manager] Stopping Ollama server...');
    this.process.kill('SIGTERM');

    // Give it a moment to shut down gracefully
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          console.log('[ollama-manager] Force killing...');
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      if (this.process) {
        this.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    this.process = null;
    this._isRunning = false;
    console.log('[ollama-manager] Stopped');
  }

  /**
   * Pull (download) a model via the Ollama API.
   * Returns progress updates via callback.
   */
  async pullModel(
    modelName: string,
    onProgress?: (status: string, completed: number, total: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ name: modelName, stream: true });

      const req = http.request({
        hostname: '127.0.0.1',
        port: this.port,
        path: '/api/pull',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => reject(new Error(`Pull failed (${res.statusCode}): ${body}`)));
          return;
        }

        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.error) {
                reject(new Error(data.error));
                return;
              }
              onProgress?.(
                data.status || '',
                data.completed || 0,
                data.total || 0
              );
            } catch {
              // partial JSON
            }
          }
        });

        res.on('end', () => {
          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              if (data.error) {
                reject(new Error(data.error));
                return;
              }
            } catch {
              // ignore
            }
          }
          resolve();
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Delete a model via the Ollama API.
   */
  async deleteModel(modelName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ name: modelName });

      const req = http.request({
        hostname: '127.0.0.1',
        port: this.port,
        path: '/api/delete',
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => reject(new Error(`Delete failed (${res.statusCode}): ${body}`)));
        }
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Wait for the server to respond to requests.
   */
  private async waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const ok = await this.ping();
        if (ok) return;
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Ollama server did not start within ${timeoutMs / 1000}s`);
  }

  private ping(): Promise<boolean> {
    return new Promise((resolve) => {
      http.get(`http://127.0.0.1:${this.port}/`, (res) => {
        resolve(res.statusCode === 200);
        res.resume(); // consume response
      }).on('error', () => resolve(false));
    });
  }
}
