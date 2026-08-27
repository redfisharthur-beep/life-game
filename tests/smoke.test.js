const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const jsFiles = [
  'server.js',
  ...fs.readdirSync(publicDir)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => path.join('public', name)),
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
  'landUp ? 1.03 : 0.97',
  'calculateResults',
  "socket.on('room:resume'",
  'turnProcessed',
  'HAPPINESS_GOAL = 36',
  'MAJOR_EVENT_CHANCE = 0.03',
].forEach((needle) => {
  assert.ok(serverSource.includes(needle), `Missing server rule: ${needle}`);
});

const uiTweaksSource = fs.readFileSync(path.join(publicDir, 'ui-final-tweaks.js'), 'utf8');
assert.ok(!uiTweaksSource.includes('new MutationObserver'), 'ui-final-tweaks.js must not reintroduce a whole-page MutationObserver loop');

console.log(`Life Game smoke tests passed (${jsFiles.length} JavaScript files checked).`);
