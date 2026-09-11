/**
 * BookUp Unified Dev Server Runner
 * Spawns both Express backend (port 3001) and Vite client (port 5173) cleanly across platforms.
 */

import { spawn } from 'child_process';

console.log('Starting BookUp backend & frontend...\n');

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';
const nodeCmd = isWin ? 'node.exe' : 'node';

const server = spawn(nodeCmd, ['server/index.js'], {
  stdio: 'inherit',
  shell: true,
});

const client = spawn(npxCmd, ['vite'], {
  stdio: 'inherit',
  shell: true,
});

function cleanup() {
  try {
    server.kill();
    client.kill();
  } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
