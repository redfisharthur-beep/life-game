import assert from 'node:assert/strict';
import { GameRoom } from '../src/game-room-auto-action.js';

const GAMES = 10_000;
const PLAYERS_PER_GAME = 4;
const MAX_STEPS_PER_GAME = 2_000;
const PROFESSIONS = [
  'doctor', 'engineer', 'sales', 'office',
  'athlete', 'rich', 'civilServant', 'artist',
];
const ACTIONS = [
  'salary', 'buyStock', 'buyLand', 'fate', 'sabotage',
  'help', 'sellStock', 'sellLand', 'dream',
];

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

function shuffle(values) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function randomConnected() {
  return Math.random() >= 0.12;
}

function validateFiniteNonNegative(label, value, gameIndex, round) {
  assert.ok(Number.isFinite(Number(value)), `${label} became non-finite in game ${gameIndex}, round ${round}: ${value}`);
  assert.ok(Number(value) >= -1e-9, `${label} became negative in game ${gameIndex}, round ${round}: ${value}`);
}

function validateRoom(room, gameIndex) {
  assert.ok(room.game, `game ${gameIndex} lost game state`);
  const round = Number(room.game.round || 0);
  assert.ok(round >= 1 && round <= 30, `game ${gameIndex} invalid round ${round}`);
  validateFiniteNonNegative('stockPrice', room.game.stockPrice, gameIndex, round);
  validateFiniteNonNegative('landPrice', room.game.landPrice, gameIndex, round);

  for (const player of room.players) {
    validateFiniteNonNegative(`${player.name}.cash`, player.cash, gameIndex, round);
    validateFiniteNonNegative(`${player.name}.stocks`, player.stocks, gameIndex, round);
    validateFiniteNonNegative(`${player.name}.land`, player.land, gameIndex, round);
    validateFiniteNonNegative(`${player.name}.happiness`, player.happiness, gameIndex, round);
    assert.ok(Number.isInteger(Number(player.helpCount || 0)), `game ${gameIndex} invalid helpCount`);
    assert.ok(Number.isInteger(Number(player.sabotageCount || 0)), `game ${gameIndex} invalid sabotageCount`);
  }
}

function expectedDiceCount(room, event) {
  if (!Array.isArray(event?.dice)) return null;
  if (room.game.forceTripleDice) return 3;
  const round = Number(room.game.round || 1);
  if (round <= 10) return 1;
  if (round <= 20) return 2;
  return 3;
}

async function settleChosenAction(engine, room, playerId, action) {
  if (action === 'salary') return engine.settleSalary(room, playerId, false);
  if (['buyStock', 'buyLand', 'sellStock', 'sellLand'].includes(action)) {
    return engine.settleMarketAction(room, playerId, action);
  }
  if (action === 'fate') return engine.settleFate(room, playerId);
  if (action === 'sabotage') return engine.settleSabotage(room, playerId);
  if (action === 'help') return engine.settleHelp(room, playerId);
  if (action === 'dream') return engine.settleDream(room, playerId);
  return false;
}

const totals = {
  games: 0,
  finishedByRound30: 0,
  finishedEarlyHappiness: 0,
  majorEvents: 0,
  eraWaves: 0,
  timeoutAutos: 0,
  offlineAutos: 0,
  recoveryTransitions: 0,
  actions: Object.fromEntries(ACTIONS.map((action) => [action, 0])),
  maxSteps: 0,
};

const startedAt = Date.now();

for (let gameIndex = 1; gameIndex <= GAMES; gameIndex += 1) {
  const engine = new GameRoom(makeState(), makeEnv());
  // Stress test deliberately avoids serializing the room on every transition;
  // production persistence is already covered by Worker integration tests.
  engine.broadcast = () => {};
  engine.broadcastRoom = async (room) => { await engine.saveRoom(room); };
  engine.scheduleAt = async () => {};
  engine.reschedule = async () => {};

  const professions = shuffle(PROFESSIONS).slice(0, PLAYERS_PER_GAME);
  const room = {
    code: `STRESS${gameIndex}`,
    hostId: 'p1',
    players: professions.map((profession, index) => ({
      id: `p${index + 1}`,
      reconnectToken: `token-${index + 1}`,
      connected: true,
      name: `P${index + 1}`,
      profession,
      cash: 0,
      stocks: 0,
      land: 0,
      happiness: 0,
      helpCount: 0,
      sabotageCount: 0,
    })),
    started: true,
    phase: 'profession',
    professionDeadline: null,
    game: null,
  };

  await engine.saveRoom(room);
  await engine.initializeGame(room);

  let steps = 0;
  let lastMajorKey = '';

  while (room.phase === 'game' && !room.game.finished) {
    steps += 1;
    assert.ok(steps <= MAX_STEPS_PER_GAME, `game ${gameIndex} stalled after ${steps} transitions at round ${room.game.round}`);
    validateRoom(room, gameIndex);

    const majorKey = room.game.majorEvent
      ? `${room.game.majorEvent.id}:${room.game.majorEvent.round}`
      : '';
    if (majorKey && majorKey !== lastMajorKey) {
      totals.majorEvents += 1;
      if (room.game.majorEvent.id === 'eraWave') totals.eraWaves += 1;
      lastMajorKey = majorKey;
    }

    if (Number(room.game.majorEventUntil || 0) > 0) {
      room.game.majorEventUntil = Date.now() - 1;
      await engine.recoverExpiredGameState(room);
      totals.recoveryTransitions += 1;
      continue;
    }

    if (Number(room.game.transitionUntil || 0) > 0) {
      room.game.transitionUntil = Date.now() - 1;
      await engine.recoverExpiredGameState(room);
      totals.recoveryTransitions += 1;
      continue;
    }

    if (Number(room.game.showcaseUntil || 0) > 0) {
      const event = room.game.lastEvent;
      if (Array.isArray(event?.dice)) {
        const expected = expectedDiceCount(room, event);
        assert.equal(
          event.dice.length,
          expected,
          `game ${gameIndex} round ${room.game.round}: expected ${expected} dice, got ${event.dice.length}`,
        );
      }
      room.game.showcaseUntil = Date.now() - 1;
      await engine.recoverExpiredGameState(room);
      totals.recoveryTransitions += 1;
      continue;
    }

    if (Number(room.game.deadline || 0) > 0) {
      const playerId = room.game.currentPlayerId;
      const turnId = room.game.turnId;
      const player = room.players.find((item) => item.id === playerId);
      assert.ok(player, `game ${gameIndex} current player missing`);

      // Randomly change connection state to exercise offline immediate auto-play.
      player.connected = randomConnected();
      if (!player.connected) {
        // A player may have disconnected after beginTurn; emulate the next recovery tick.
        if (engine.claimTurn(room, playerId, turnId)) {
          const settled = await engine.settleRandomAutoAction(room, playerId, 'offline');
          assert.equal(settled, true, `game ${gameIndex} offline auto action failed`);
          totals.offlineAutos += 1;
          if (room.game.lastEvent?.autoAction) totals.actions[room.game.lastEvent.autoAction] += 1;
        }
        continue;
      }

      // Roughly 18% of connected turns intentionally time out.
      if (Math.random() < 0.18) {
        room.game.deadline = Date.now() - 1;
        await engine.recoverExpiredGameState(room);
        totals.timeoutAutos += 1;
        if (room.game.lastEvent?.autoAction) totals.actions[room.game.lastEvent.autoAction] += 1;
        continue;
      }

      const available = engine.getAvailableAutoActions(room, playerId);
      assert.ok(available.length > 0, `game ${gameIndex} has no available action`);
      const action = available[Math.floor(Math.random() * available.length)];
      assert.ok(engine.claimTurn(room, playerId, turnId), `game ${gameIndex} failed to claim active turn`);
      const settled = await settleChosenAction(engine, room, playerId, action);
      assert.equal(settled, true, `game ${gameIndex} action ${action} failed to settle`);
      totals.actions[action] += 1;
      continue;
    }

    // No wait-state at all is considered a recoverable structural stall.
    const recovered = await engine.recoverExpiredGameState(room);
    assert.equal(recovered, true, `game ${gameIndex} entered unrecoverable idle state at round ${room.game.round}`);
    totals.recoveryTransitions += 1;
  }

  assert.equal(room.phase, 'finished', `game ${gameIndex} did not finish`);
  assert.equal(room.game.finished, true, `game ${gameIndex} missing finished flag`);
  validateRoom(room, gameIndex);
  assert.equal(room.game.results?.rankings?.length, PLAYERS_PER_GAME, `game ${gameIndex} invalid ranking count`);
  assert.equal(new Set(room.game.results.rankings.map((entry) => entry.playerId)).size, PLAYERS_PER_GAME, `game ${gameIndex} duplicate rankings`);

  const finishText = String(room.game.lastEvent?.text || '');
  if (finishText.includes('50歲')) totals.finishedByRound30 += 1;
  else totals.finishedEarlyHappiness += 1;

  totals.games += 1;
  totals.maxSteps = Math.max(totals.maxSteps, steps);
}

assert.equal(totals.games, GAMES);
assert.equal(totals.finishedByRound30 + totals.finishedEarlyHappiness, GAMES);
for (const action of ACTIONS) {
  assert.ok(totals.actions[action] > 0, `stress run never executed action ${action}`);
}
assert.ok(totals.majorEvents > 0, 'stress run never triggered a major event');
assert.ok(totals.eraWaves > 0, 'stress run never triggered era wave');
assert.ok(totals.timeoutAutos > 0, 'stress run never exercised timeout auto actions');
assert.ok(totals.offlineAutos > 0, 'stress run never exercised offline auto actions');

const elapsedMs = Date.now() - startedAt;
console.log(JSON.stringify({
  ok: true,
  elapsedMs,
  ...totals,
}, null, 2));
console.log(`10,000-game four-player stress simulation passed in ${(elapsedMs / 1000).toFixed(2)}s`);
