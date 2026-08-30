import assert from 'node:assert/strict';
import { GameRoom } from '../src/game-room-auto-action.js';

class MemoryStorage {
  constructor() {
    this.map = new Map();
    this.alarm = null;
  }
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, value); }
  async setAlarm(value) { this.alarm = Number(value); }
  async getAlarm() { return this.alarm; }
  async deleteAlarm() { this.alarm = null; }
}

function makeState() {
  const storage = new MemoryStorage();
  return {
    storage,
    getWebSockets() { return []; },
  };
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
engine.scheduleAt = async () => {};
engine.reschedule = async () => {};
engine.broadcastRoom = async (room) => { await engine.saveRoom(room); };

const room = {
  code: 'ROUND21',
  hostId: 'p1',
  players: [
    {
      id: 'p1', reconnectToken: 't1', connected: true, name: 'P1', profession: 'doctor',
      cash: 0, stocks: 0, land: 0, happiness: 0, helpCount: 0, sabotageCount: 0,
    },
    {
      id: 'p2', reconnectToken: 't2', connected: true, name: 'P2', profession: 'engineer',
      cash: 0, stocks: 0, land: 0, happiness: 0, helpCount: 0, sabotageCount: 0,
    },
  ],
  started: true,
  phase: 'profession',
  professionDeadline: null,
  game: null,
};

await engine.saveRoom(room);
await engine.initializeGame(room);

// Reproduce the exact 41-year state: round 21 is waiting for the 3-dice transition to expire.
room.phase = 'game';
room.game.round = 21;
room.game.turnOrder = ['p1', 'p2'];
room.game.turnIndex = 0;
room.game.currentPlayerId = null;
room.game.turnId = null;
room.game.turnProcessed = false;
room.game.deadline = null;
room.game.showcaseUntil = null;
room.game.majorEventUntil = null;
room.game.transitionUntil = Date.now() - 1;
await engine.saveRoom(room);

const recovered = await engine.recoverExpiredGameState(room);
assert.equal(recovered, true, 'round 21 transition should recover');
assert.equal(room.game.transitionUntil, null, 'round 21 transition must be cleared');
assert.ok(room.game.currentPlayerId, 'round 21 must start a player turn');
assert.ok(room.game.turnId, 'round 21 must create a turn token');
assert.ok(Number(room.game.deadline || 0) > Date.now(), 'round 21 must create a live deadline');

const playerId = room.game.currentPlayerId;
const turnId = room.game.turnId;
assert.equal(engine.claimTurn(room, playerId, turnId), true, 'round 21 turn should be claimable');
assert.equal(await engine.settleSalary(room, playerId, false), true, 'round 21 action should settle');
assert.equal(room.game.lastEvent.dice.length, 3, '41-year action must roll exactly three dice');
assert.ok(room.game.lastEvent.diceTotal >= 3 && room.game.lastEvent.diceTotal <= 18, 'three-dice total must be 3..18');
assert.ok(Number(room.game.showcaseUntil || 0) > Date.now(), 'result showcase should continue normally');

console.log('Round 21 / age 41 triple-dice regression passed.');
