#!/usr/bin/env node

/**
 * Downloads the Ollama binary for the current (or specified) platform.
 * 
 * Usage:
 *   node scripts/download-ollama.js          # Download for current platform
 *   node scripts/download-ollama.js darwin    # Download for macOS
 *   node scripts/download-ollama.js linux     # Download for Linux x64
 *   node scripts/download-ollama.js win32     # Download for Windows
 *
 * The binary is downloaded to resources/ollama/<platform>/
 * This script is meant to be run during development or as a postinstall step.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OLLAMA_VERSION = '0.6.2';

const DOWNLOADS = {
  'darwin': {
    url: `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin.tgz`,
    dir: 'darwin',
    binary: 'ollama',
    extract: 'tgz',
  },
  'linux-x64': {
    url: `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-linux-amd64.tgz`,
    dir: 'linux-x64',
    binary: 'bin/ollama',
    extract: 'tgz',
  },
  'linux-arm64': {
    url: `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-linux-arm64.tgz`,
    dir: 'linux-arm64',
    binary: 'bin/ollama',
    extract: 'tgz',
  },
  'win32': {
    url: `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-windows-amd64.zip`,
    dir: 'win32-x64',
    binary: 'ollama.exe',
    extract: 'zip',
  },
};

function getPlatformKey() {
  const arg = process.argv[2];
  if (arg) return arg === 'linux' ? `linux-${process.arch}` : arg;
  
  const platform = process.platform;
  if (platform === 'darwin') return 'darwin';
  if (platform === 'linux') return `linux-${process.arch}`;
  if (platform === 'win32') return 'win32';
  throw new Error(`Unsupported platform: ${platform}`);
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl) => {
      const lib = requestUrl.startsWith('https') ? https : http;
      lib.get(requestUrl, { headers: { 'User-Agent': 'cse-pv-generation' } }, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          return makeRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${requestUrl}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        const file = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const pct = ((downloadedBytes / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\r  Downloading: ${pct}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
          } else {
            process.stdout.write(`\r  Downloaded: ${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`);
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('');
          resolve();
        });
        file.on('error', reject);
      }).on('error', reject);
    };
    makeRequest(url);
  });
}

async function main() {
  const platformKey = getPlatformKey();
  const config = DOWNLOADS[platformKey];
  
  if (!config) {
    console.error(`No download config for platform: ${platformKey}`);
    console.error(`Available: ${Object.keys(DOWNLOADS).join(', ')}`);
    process.exit(1);
  }

  const resourcesDir = path.join(__dirname, '..', 'resources', 'ollama', config.dir);
  const archivePath = path.join(resourcesDir, `ollama-archive.${config.extract}`);

  // Check if binary already exists
  const binaryPath = path.join(resourcesDir, config.binary);
  if (fs.existsSync(binaryPath)) {
    console.log(`Ollama binary already exists at ${binaryPath}`);
    console.log(`Delete it to re-download.`);
    return;
  }

  console.log(`Downloading Ollama v${OLLAMA_VERSION} for ${platformKey}...`);
  console.log(`  URL: ${config.url}`);

  // Create directory
  fs.mkdirSync(resourcesDir, { recursive: true });

  // Download
  await download(config.url, archivePath);

  // Extract
  console.log(`  Extracting to ${resourcesDir}...`);
  
  if (config.extract === 'tgz') {
    execSync(`tar xzf "${archivePath}" -C "${resourcesDir}"`, { stdio: 'inherit' });
  } else if (config.extract === 'zip') {
    execSync(`unzip -o "${archivePath}" -d "${resourcesDir}"`, { stdio: 'inherit' });
  }

  // Clean up archive
  fs.unlinkSync(archivePath);

  // Make binary executable (macOS/Linux)
  if (process.platform !== 'win32') {
    // Find the ollama binary - it might be at different paths depending on archive structure
    const possiblePaths = [
      path.join(resourcesDir, 'ollama'),
      path.join(resourcesDir, 'bin', 'ollama'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        fs.chmodSync(p, 0o755);
        console.log(`  Made executable: ${p}`);
      }
    }
  }

  // Verify binary exists
  if (fs.existsSync(binaryPath)) {
    const stat = fs.statSync(binaryPath);
    console.log(`\nOllama binary ready: ${binaryPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    // List what was extracted to help debug
    console.log('\n  Extracted contents:');
    const listFiles = (dir, prefix = '  ') => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          console.log(`${prefix}${item.name}/`);
          listFiles(fullPath, prefix + '  ');
        } else {
          const stat = fs.statSync(fullPath);
          console.log(`${prefix}${item.name} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
        }
      }
    };
    listFiles(resourcesDir);
    console.error(`\nExpected binary at ${binaryPath} not found!`);
    console.error('The archive structure may have changed. Check extracted contents above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
