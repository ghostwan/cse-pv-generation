#!/usr/bin/env node

/**
 * Script de développement : lance Vite puis Electron avec le bon port.
 * - Compile le main process TypeScript
 * - Démarre Vite dev server
 * - Attend que Vite soit prêt et récupère le port
 * - Lance Electron avec VITE_DEV_SERVER_URL
 */

const { spawn, execSync } = require('child_process');
const http = require('http');

const VITE_PORT = 5173;
const MAX_RETRIES = 30;

function log(msg) {
  console.log(`\x1b[36m[dev]\x1b[0m ${msg}`);
}

function logError(msg) {
  console.error(`\x1b[31m[dev]\x1b[0m ${msg}`);
}

function waitForServer(url, retries = 0) {
  return new Promise((resolve, reject) => {
    const tryConnect = (attempt) => {
      if (attempt >= MAX_RETRIES) {
        reject(new Error(`Vite server not ready after ${MAX_RETRIES} attempts`));
        return;
      }

      http.get(url, (res) => {
        resolve(url);
      }).on('error', () => {
        setTimeout(() => tryConnect(attempt + 1), 500);
      });
    };
    tryConnect(retries);
  });
}

async function main() {
  // Step 1: Compile main process
  log('Compilation du main process...');
  try {
    execSync('npx tsc -p tsconfig.main.json', { stdio: 'inherit' });
    log('Main process compile.');
  } catch (e) {
    logError('Echec de la compilation du main process');
    process.exit(1);
  }

  // Step 2: Start Vite
  log('Demarrage de Vite...');
  const vite = spawn('npx', ['vite', '--config', 'vite.config.ts', '--port', String(VITE_PORT), '--strictPort'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  });

  let viteUrl = `http://localhost:${VITE_PORT}`;
  let viteReady = false;

  vite.stdout.on('data', (data) => {
    const output = data.toString();
    process.stdout.write(output);

    // Parse the actual URL from Vite output
    const match = output.match(/Local:\s+(https?:\/\/[^\s]+)/);
    if (match) {
      viteUrl = match[1].replace(/\/$/, '');
      viteReady = true;
    }
  });

  vite.stderr.on('data', (data) => {
    const output = data.toString();
    // Filter out the CJS deprecation warning
    if (!output.includes('CJS build of Vite')) {
      process.stderr.write(output);
    }
  });

  vite.on('exit', (code) => {
    if (code !== null && code !== 0) {
      logError(`Vite a quitte avec le code ${code}`);
      process.exit(code);
    }
  });

  // Step 3: Wait for Vite to be ready
  log('Attente du serveur Vite...');
  try {
    // If strictPort fails, Vite won't start. But let's also try the parsed URL.
    await waitForServer(viteUrl);
    log(`Vite pret sur ${viteUrl}`);
  } catch (e) {
    logError('Le serveur Vite n\'a pas demarre a temps');
    vite.kill();
    process.exit(1);
  }

  // Step 4: Launch Electron
  log('Lancement d\'Electron...');
  const electron = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: viteUrl,
    },
  });

  electron.on('exit', (code) => {
    log('Electron ferme.');
    vite.kill();
    process.exit(code || 0);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    log('Arret...');
    electron.kill();
    vite.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    electron.kill();
    vite.kill();
    process.exit(0);
  });
}

main().catch((e) => {
  logError(e.message);
  process.exit(1);
});
