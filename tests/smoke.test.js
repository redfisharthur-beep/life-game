const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const indexPath = path.join(publicDir, 'index.html');

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function normalizePublicUrl(url) {
  const clean = String(url || '').split('?')[0].split('#')[0];
  if (!clean.startsWith('/')) return null;
  if (clean === '/socket.io/socket.io.js') return null;
  return path.join('public', decodeURIComponent(clean.slice(1)));
}

const publicTopFiles = fs.readdirSync(publicDir).filter((name) => {
  const fullPath = path.join(publicDir, name);
  return fs.statSync(fullPath).isFile();
});

const jsFiles = [
  'server.js',
  'runtime-rules.js',
  ...publicTopFiles
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
  'TURN_MS = 6_000',
  'ACTION_SHOWCASE_MS = 8_000',
  'MAJOR_EVENT_MS = 4_000',
  'MAJOR_EVENT_CHANCE = 0.05',
  'calculateResults',
  "socket.on('room:resume'",
  'turnProcessed',
  "id: 'financialCrash'",
  "id: 'earthquake'",
  "id: 'inflation'",
  "id: 'aiBoom'",
  "id: 'urbanRenewal'",
  "id: 'eraWave'",
  "id: 'happinessBoost'",
  "id: 'cashGrant'",
].forEach((needle) => {
  assert.ok(serverSource.includes(needle), `Missing server rule: ${needle}`);
});

const runtimeSource = fs.readFileSync(path.join(root, 'runtime-rules.js'), 'utf8');
[
  'const HAPPINESS_GOAL = 48;',
  'const stockUp = Math.random() < 0.60;',
  'const landUp = Math.random() < 0.80;',
  'stockUp ? 1.15 : 0.92',
  'landUp ? 1.04 : 0.96',
  'salaryRaiseFactor = 1 + (Math.floor((room.game.round - 1) / 5) * 0.1)',
  'total * 2 * profession.stock',
  'total * 2 * profession.land',
  'before > 0 ? round2(before * positiveFactor) : before',
  'before > 0 ? round2(before * negativeFactor) : before',
  'before > 0 ? round2(before * factor) : before',
].forEach((needle) => {
  assert.ok(runtimeSource.includes(needle), `Missing runtime rule: ${needle}`);
});

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(packageJson.scripts?.start, 'node runtime-rules.js', 'Start script must use runtime rule layer');
assert.strictEqual(packageJson.scripts?.test, 'node tests/smoke.test.js', 'Test script mismatch');

const indexSource = fs.readFileSync(indexPath, 'utf8');
const indexRefs = [...indexSource.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
indexRefs.forEach((url) => {
  const relativePath = normalizePublicUrl(url);
  if (!relativePath) return;
  assert.ok(exists(relativePath), `Broken index reference: ${url} -> ${relativePath}`);
});

const linkedTopFiles = new Set(indexRefs.map((url) => String(url).split('?')[0].replace(/^\//, '')));
publicTopFiles
  .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
  .forEach((name) => {
    assert.ok(linkedTopFiles.has(name), `Unlinked public code file: public/${name}`);
  });

const textFiles = publicTopFiles.filter((name) => /\.(?:html|js|css)$/.test(name));
textFiles.forEach((name) => {
  const source = fs.readFileSync(path.join(publicDir, name), 'utf8');
  const refs = [...source.matchAll(/["'](\/(?:images|music)\/[^"']+)["']/g)].map((match) => match[1]);
  refs.forEach((url) => {
    const relativePath = normalizePublicUrl(url);
    if (!relativePath) return;
    assert.ok(exists(relativePath), `Broken asset reference in public/${name}: ${url}`);
  });
});

const uiTweaksSource = fs.readFileSync(path.join(publicDir, 'ui-final-tweaks.js'), 'utf8');
assert.ok(!uiTweaksSource.includes('new MutationObserver'), 'ui-final-tweaks.js must not reintroduce a whole-page MutationObserver loop');

assert.ok(!fs.existsSync(path.join(root, 'images')), 'Legacy root images/ directory should not exist');
assert.ok(!fs.existsSync(path.join(publicDir, 'images', '.gitkeep')), 'public/images/.gitkeep is unnecessary');
assert.ok(!fs.existsSync(path.join(publicDir, 'music', '.gitkeep')), 'public/music/.gitkeep is unnecessary');

console.log(`Life Game final smoke tests passed (${jsFiles.length} JavaScript files checked).`);
