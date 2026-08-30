import assert from 'node:assert/strict';
import { GameRoom } from '../src/game-room-auto-action.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, value); }
  async setAlarm() {}
}

function makeState() {
  const storage = new MemoryStorage();
  return { storage, getWebSockets() { return []; } };
}

function makeEnv() {
  return {
    MATCHMAKER: {
      idFromName() { return 'global'; },
      get() { return { async fetch() { return new Response('{}'); } }; },
    },
  };
}

const engine = new GameRoom(makeState(), makeEnv());
engine.broadcast = () => {};
engine.broadcastRoom = async (room) => { await engine.saveRoom(room); };
engine.scheduleAt = async () => {};
engine.reschedule = async () => {};

const room = {
  code: 'MILESTONE',
  hostId: 'p1',
  players: [
    { id: 'p1', reconnectToken: 't1', connected: true, name: 'P1', profession: 'doctor', cash: 0, stocks: 0, land: 0, happiness: 0, helpCount: 0, sabotageCount: 0 },
    { id: 'p2', reconnectToken: 't2', connected: true, name: 'P2', profession: 'engineer', cash: 0, stocks: 0, land: 0, happiness: 0, helpCount: 0, sabotageCount: 0 },
  ],
  started: true,
  phase: 'profession',
  professionDeadline: null,
  game: null,
};

await engine.initializeGame(room);
const player = room.players[0];

player.cash = 5000;
let awards = engine.applyHappinessMilestones(room, [player]);
assert.equal(player.happiness, 3, 'assets 5000 should grant +3 happiness');
assert.deepEqual(awards.map((x) => x.milestoneId), ['assets-5000']);

player.cash = 16000;
awards = engine.applyHappinessMilestones(room, [player]);
assert.equal(player.happiness, 13, 'crossing 10000 and 15000 should add +5 +5');
assert.deepEqual(awards.map((x) => x.milestoneId), ['assets-10000', 'assets-15000']);

awards = engine.applyHappinessMilestones(room, [player]);
assert.equal(awards.length, 0, 'earned asset milestones must not repeat');
assert.equal(player.happiness, 13, 'rechecking must not duplicate happiness');

player.land = 310;
awards = engine.applyHappinessMilestones(room, [player]);
assert.equal(player.happiness, 26, 'land 300 should cumulatively grant +13');
assert.deepEqual(awards.map((x) => x.milestoneId), ['land-100', 'land-200', 'land-300']);

player.stocks = 305;
awards = engine.applyHappinessMilestones(room, [player]);
assert.equal(player.happiness, 39, 'stocks 300 should cumulatively grant +13');
assert.deepEqual(awards.map((x) => x.milestoneId), ['stocks-100', 'stocks-200', 'stocks-300']);

// Total assets use live market value: cash + stocks*stock price + land*land price.
const markedPlayer = room.players[1];
markedPlayer.cash = 0;
markedPlayer.stocks = 250;
markedPlayer.land = 250;
room.game.stockPrice = 10;
room.game.landPrice = 10;
assert.equal(engine.playerAssets(markedPlayer, room.game), 5000);
engine.applyHappinessMilestones(room, [markedPlayer]);
assert.equal(markedPlayer.happiness, 19, 'market-valued assets 5000 plus stock/land 100 and 200 thresholds should all award once');

console.log('Happiness milestone regression passed.');
