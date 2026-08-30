const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const wrangler = read('wrangler.jsonc');
const worker = read('src/worker.js');
const gameRoom = read('src/game-room.js');
const matchmaker = read('src/matchmaker.js');
const socketCompat = read('public/cloudflare-socket.js');
const index = read('public/index.html');

assert.match(wrangler, /"GAME_ROOMS"/, 'GAME_ROOMS Durable Object binding is missing');
assert.match(wrangler, /"MATCHMAKER"/, 'MATCHMAKER Durable Object binding is missing');
assert.match(wrangler, /"new_sqlite_classes"/, 'Durable Object migration is missing');

assert.match(worker, /\/health/, 'Worker health endpoint is missing');
assert.match(worker, /\/api\/auto-join/, 'Worker auto-join route is missing');
assert.match(worker, /\/ws\//, 'Worker WebSocket route is missing');
assert.match(worker, /env\.ASSETS\.fetch/, 'Static asset fallback is missing');

assert.match(gameRoom, /const TOTAL_ROUNDS = 30;/, 'Game must stay at 30 rounds');
assert.match(gameRoom, /const HAPPINESS_GOAL = 48;/, 'Happiness goal must stay at 48');
assert.match(gameRoom, /round >= 16 \? 2 : 1/, 'Two-dice acceleration must begin at round 16');
assert.match(gameRoom, /const MAJOR_EVENT_CHANCE = 0\.08;/, 'Major-event chance must stay at 8%');
assert.match(gameRoom, /setAlarm\(/, 'Durable Object Alarm scheduling is missing');
assert.match(gameRoom, /async alarm\(\)/, 'Durable Object Alarm handler is missing');
assert.match(gameRoom, /async webSocketMessage\(/, 'Durable Object WebSocket handler is missing');
assert.match(gameRoom, /game:restart/, 'Restart flow is missing');
assert.match(gameRoom, /this\.calculateResults\(room\)/, 'Final ranking calculation is missing');

assert.match(matchmaker, /autoJoin/, 'Matchmaker autoJoin is missing');
assert.match(socketCompat, /class CloudflareSocketCompat/, 'Cloudflare socket compatibility layer is missing');
assert.match(socketCompat, /new WebSocket\(/, 'Native WebSocket connection is missing');

assert.match(index, /cloudflare-socket\.js/, 'Cloudflare socket compatibility script is not loaded');
assert.doesNotMatch(index, /socket\.io\/socket\.io\.js/, 'Legacy Socket.IO browser client must not be loaded on Cloudflare');

console.log('Cloudflare smoke checks passed');
