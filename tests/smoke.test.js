const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const jsFiles = [
  'server.js',
  'public/app.js',
  'public/action-showcase.js',
  'public/player-status.js',
];

jsFiles.forEach((relativePath) => {
  const fullPath = path.join(root, relativePath);
  assert.ok(fs.existsSync(fullPath), `Missing ${relativePath}`);
  execFileSync(process.execPath, ['--check', fullPath], { stdio: 'pipe' });
});

const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
[
  'TOTAL_ROUNDS = 30',
  'TURN_MS = 10_000',
  'round >= 20 ? 2 : 1',
  'stockUp ? 1.10 : 0.93',
  'landPrice * 1.03',
  'calculateResults',
  "socket.on('room:resume'",
  'turnProcessed',
].forEach((needle) => {
  assert.ok(serverSource.includes(needle), `Missing server rule: ${needle}`);
});

console.log('Life Game smoke tests passed.');
