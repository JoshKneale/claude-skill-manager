#!/usr/bin/env node
// Cross-platform trigger wrapper
// Detects OS and spawns the appropriate script (bash or PowerShell)

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const scriptDir = __dirname;
const isWindows = os.platform() === 'win32';

let child;

if (isWindows) {
  // Windows: use PowerShell
  const psScript = path.join(scriptDir, 'trigger.ps1');
  child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', psScript], {
    stdio: ['pipe', 'inherit', 'inherit'],
    windowsHide: true
  });
} else {
  // macOS/Linux: use bash
  const bashScript = path.join(scriptDir, 'trigger.sh');
  child = spawn('bash', [bashScript], {
    stdio: ['pipe', 'inherit', 'inherit']
  });
}

// Pipe stdin to child process (hooks may send JSON data)
process.stdin.pipe(child.stdin);

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error(`Failed to start script: ${err.message}`);
  process.exit(1);
});
