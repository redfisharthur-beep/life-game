import assert from 'node:assert/strict';
import { GameRoom } from '../src/game-room-stable.js';

let alarmValue = null;
const storage = {
  async getAlarm() { return alarmValue; },
  async setAlarm(value) { alarmValue = value; },
  async deleteAlarm() { alarmValue = null; },
};
const state = {
  storage,
  getWebSockets() { return []; },
};

const room = new GameRoom(state, {});
const now = Date.now();

await room.scheduleAt(now + 10_000);
const firstAlarm = alarmValue;
assert.ok(firstAlarm >= now + 9_900, 'First alarm should be scheduled');

await room.scheduleAt(now + 20_000);
assert.equal(alarmValue, firstAlarm, 'A later alarm must not overwrite an earlier alarm');

await room.scheduleAt(now + 5_000);
assert.ok(alarmValue < firstAlarm, 'An earlier alarm should replace the current alarm');

const deadline = now + 4_000;
const showcase = now + 8_000;
const disconnect = now + 12_000;
const next = room.getNextDeadline({
  phase: 'game',
  players: [{ disconnectDeadline: disconnect }],
  game: {
    finished: false,
    deadline,
    showcaseUntil: showcase,
    transitionUntil: null,
    majorEventUntil: null,
  },
});
assert.equal(next, deadline, 'Game turn deadline should win when it is the earliest active deadline');

const lobbyNext = room.getNextDeadline({
  phase: 'lobby',
  players: [
    { disconnectDeadline: now + 15_000 },
    { disconnectDeadline: now + 7_000 },
  ],
  game: null,
});
assert.equal(lobbyNext, now + 7_000, 'Earliest disconnected-player cleanup should be scheduled first');

console.log('Cloudflare alarm scheduling checks passed');
