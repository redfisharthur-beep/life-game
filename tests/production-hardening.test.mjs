import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const worker = read('src/worker.js');
const hardening = read('src/game-room-hardening.js');
const playerStatus = read('public/player-status.js');
const roomControls = read('public/room-controls.js');
const uiTweaks = read('public/ui-final-tweaks.js');
const diceAnimation = read('public/dice-animation.js');
const actionShowcase = read('public/action-showcase.js');
const index = read('public/index.html');

assert.match(worker, /game-room-hardening\.js/, 'Production worker must export the hardened GameRoom chain');
assert.match(hardening, /PROFESSION_AUTO_PICK_MS\s*=\s*60_000/, 'Profession auto-pick must be capped at 60 seconds');
assert.match(hardening, /hostName:\s*host\?\.name\s*\|\|\s*''/, 'Matchmaker sync must include the current host name');

assert.doesNotMatch(playerStatus, /setInterval\s*\(/, 'Player status must not continuously rebuild on a polling interval');
assert.doesNotMatch(roomControls, /setInterval\s*\(/, 'Lobby controls must not poll continuously');
assert.doesNotMatch(uiTweaks, /setInterval\s*\(/, 'UI tweaks must not poll continuously');

assert.match(diceAnimation, /preloadFrames\(diceCount\)/, 'Dice frames should be loaded by the active dice count');
assert.match(diceAnimation, /preloadFrames\(1\)/, 'Single-die roll frames must be warmed up for reliable first-roll animation');
assert.doesNotMatch(diceAnimation, /\[\.\.\.SINGLE_ROLL_FRAMES,\s*\.\.\.DOUBLE_ROLL_FRAMES,\s*\.\.\.TRIPLE_ROLL_FRAMES\]\.forEach/, 'All 15 dice frames must not be preloaded on page load');
assert.doesNotMatch(diceAnimation, /observer\.observe\(document\.body/, 'Dice observer should not watch the entire document body');
assert.match(actionShowcase, /simple-choice-result/, 'Result stage should use the simplified result layout');

// 命運／陷害／援助結果必須直接使用後端已結算欄位，不可在前端套舊公式重算。
assert.match(actionShowcase, /event\.targetChange/, 'Sabotage/help result must use the settled targetChange');
assert.match(actionShowcase, /event\.amount/, 'Cash fate result must use the settled amount');
assert.match(actionShowcase, /event\.units/, 'Stock/land fate result must use the settled units');
assert.match(actionShowcase, /event\.happinessChange/, 'Happiness fate result must use the settled happinessChange');
assert.doesNotMatch(actionShowcase, /150\s*\*\s*total/, 'Frontend must not restore the obsolete fate cash formula');
assert.doesNotMatch(actionShowcase, /5\s*\*\s*total/, 'Frontend must not restore the obsolete fixed stock/land fate formula');

assert.doesNotMatch(index, /action-result-head-fix\.js|game-ui-v2\.js|showcase-result-overrides\.js|dream-result\.js/, 'Obsolete result patch scripts must stay unloaded');

console.log('Production hardening regression checks passed');
