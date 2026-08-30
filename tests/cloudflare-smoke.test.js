const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const wrangler = read('wrangler.jsonc');
const worker = read('src/worker.js');
const gameRoom = read('src/game-room.js');
const gameRoomEight = read('src/game-room-eight.js');
const gameRoomRulesV2 = read('src/game-room-rules-v2.js');
const gameRoomRecovery = read('src/game-room-recovery.js');
const gameRoomEraWave = read('src/game-room-era-wave.js');
const gameRoomAutoAction = read('src/game-room-auto-action.js');
const matchmaker = read('src/matchmaker.js');
const socketCompat = read('public/cloudflare-socket.js');
const app = read('public/app.js');
const professionExtension = read('public/profession-extension.js');
const professionEight = read('public/profession-eight.css');
const index = read('public/index.html');

assert.match(wrangler, /"GAME_ROOMS"/, 'GAME_ROOMS Durable Object binding is missing');
assert.match(wrangler, /"MATCHMAKER"/, 'MATCHMAKER Durable Object binding is missing');
assert.match(wrangler, /"new_sqlite_classes"/, 'Durable Object migration is missing');

assert.match(worker, /\/health/, 'Worker health endpoint is missing');
assert.match(worker, /\/api\/auto-join/, 'Worker auto-join route is missing');
assert.match(worker, /const wsMatch = url\.pathname\.match/, 'Worker WebSocket route is missing');
assert.match(worker, /target\.pathname = '\/ws'/, 'Worker WebSocket Durable Object forwarding is missing');
assert.match(worker, /env\.ASSETS\.fetch/, 'Static asset fallback is missing');
assert.match(worker, /game-room-auto-action\.js/, 'Worker must use random automatic-action wrapper');

assert.match(gameRoom, /const TOTAL_ROUNDS = 30;/, 'Game must stay at 30 rounds');
assert.match(gameRoom, /const HAPPINESS_GOAL = 48;/, 'Happiness goal must stay at 48');
assert.match(gameRoom, /const MAJOR_EVENT_CHANCE = 0\.08;/, 'Major-event chance must stay at 8%');
assert.match(gameRoom, /setAlarm\(/, 'Durable Object Alarm scheduling is missing');
assert.match(gameRoom, /async alarm\(\)/, 'Durable Object Alarm handler is missing');
assert.match(gameRoom, /async webSocketMessage\(/, 'Durable Object WebSocket handler is missing');
assert.match(gameRoom, /game:restart/, 'Restart flow is missing');
assert.match(gameRoom, /this\.calculateResults\(room\)/, 'Final ranking calculation is missing');

assert.match(gameRoomRulesV2, /normalizedRound <= 10 \? 1 : normalizedRound <= 20 \? 2 : 3/, 'Dice progression must be 1/2/3 dice across rounds 1-10/11-20/21-30');
assert.match(gameRoomRulesV2, /room\.game\.round === 11 \|\| room\.game\.round === 21/, 'Dice transition announcements must occur at rounds 11 and 21');

assert.match(gameRoomRecovery, /recoverExpiredGameState/, 'Stalled-room recovery routine is missing');
assert.match(gameRoomRecovery, /room:resume/, 'Room resume must trigger stalled-room recovery');
assert.match(gameRoomRecovery, /showcaseUntil/, 'Expired showcase recovery is missing');
assert.match(gameRoomRecovery, /transitionUntil/, 'Expired transition recovery is missing');
assert.match(gameRoomRecovery, /majorEventUntil/, 'Expired major-event recovery is missing');
assert.match(gameRoomRecovery, /deadline/, 'Expired turn deadline recovery is missing');
assert.match(gameRoomRecovery, /async alarm\(\)/, 'Alarm recovery fallback is missing');

assert.match(gameRoomEraWave, /event\?\.id === 'eraWave'/, 'Era wave major-event override is missing');
assert.match(gameRoomEraWave, /forceTripleDice = true/, 'Era wave must enable permanent three-dice mode');
assert.match(gameRoomEraWave, /forceDoubleDice = false/, 'Era wave must disable the legacy double-dice flag');
assert.match(gameRoomEraWave, /後續所有骰子都改為3顆/, 'Era wave public description must say three dice');
assert.match(gameRoomEraWave, /withTripleDice/, 'Era wave three-dice action wrapper is missing');

assert.match(gameRoomAutoAction, /const AUTO_ACTIONS = \[/, 'Automatic action pool is missing');
assert.match(gameRoomAutoAction, /settleRandomAutoAction/, 'Random automatic action routine is missing');
assert.match(gameRoomAutoAction, /if \(!auto\) return super\.settleSalary/, 'Manual salary action must remain unchanged');
assert.match(gameRoomAutoAction, /player\?\.connected \? 'timeout' : 'offline'/, 'Timeout and offline auto-action reasons must be supported');
assert.match(gameRoomAutoAction, /if \(!player \|\| player\.connected\) return;/, 'Offline players must auto-act when their turn begins');

assert.match(gameRoomEight, /civilServant: \{ name: '公務員'/, 'Civil servant gameplay definition is missing');
assert.match(gameRoomEight, /artist: \{ name: '藝人'/, 'Artist gameplay definition is missing');
assert.match(gameRoomEight, /salary: 6\.5, stock: 1\.5, land: 1\.5, dream: 2\.35/, 'Civil servant balance values changed unexpectedly');
assert.match(gameRoomEight, /salary: 8, stock: 1\.25, land: 0\.75, dream: 2\.55/, 'Artist balance values changed unexpectedly');

assert.match(matchmaker, /autoJoin/, 'Matchmaker autoJoin is missing');
assert.match(socketCompat, /class CloudflareSocketCompat/, 'Cloudflare socket compatibility layer is missing');
assert.match(socketCompat, /new WebSocket\(/, 'Native WebSocket connection is missing');

assert.match(app, /id: 'civilServant'/, 'Civil servant profession UI is missing from app.js');
assert.match(app, /id: 'artist'/, 'Artist profession UI is missing from app.js');
assert.match(professionExtension, /civilServant/, 'Civil servant profession extension is missing');
assert.match(professionExtension, /artist/, 'Artist profession extension is missing');
assert.match(professionExtension, /civil%20servant\.png/, 'Civil servant image is not connected');
assert.match(professionEight, /grid-template-rows: repeat\(4/, 'Profession grid must use four rows');
assert.match(professionEight, /grid-template-columns: repeat\(2/, 'Profession grid must use two columns');

assert.match(index, /cloudflare-socket\.js/, 'Cloudflare socket compatibility script is not loaded');
assert.match(index, /profession-eight\.css/, '2x4 profession layout is not loaded');
assert.match(index, /game-ui-v2\.js/, 'Updated special result UI script is not loaded');
assert.match(index, /game-ui-v2\.css/, 'Updated special result UI styles are not loaded');
assert.doesNotMatch(index, /socket\.io\/socket\.io\.js/, 'Legacy Socket.IO browser client must not be loaded on Cloudflare');

console.log('Cloudflare smoke checks passed');
