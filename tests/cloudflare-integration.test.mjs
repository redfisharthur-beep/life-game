import assert from 'node:assert/strict';

const HTTP_BASE = process.env.CF_TEST_BASE || 'http://127.0.0.1:8787';
const WS_BASE = HTTP_BASE.replace(/^http/, 'ws');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth() {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${HTTP_BASE}/health`);
      if (response.ok) {
        const body = await response.json();
        assert.equal(body.ok, true);
        assert.equal(body.service, 'life-game');
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError || new Error('Worker health check timed out');
}

async function autoJoin(name) {
  const response = await fetch(`${HTTP_BASE}/api/auto-join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  assert.equal(response.ok, true, `auto-join HTTP failed for ${name}`);
  const result = await response.json();
  assert.equal(result.ok, true, `auto-join failed for ${name}: ${result.message || 'unknown error'}`);
  assert.ok(result.session?.roomCode);
  assert.ok(result.session?.playerId);
  assert.ok(result.session?.reconnectToken);
  return result;
}

class Peer {
  constructor(session) {
    this.session = session;
    this.pending = new Map();
    this.events = [];
    const params = new URLSearchParams({
      playerId: session.playerId,
      reconnectToken: session.reconnectToken,
    });
    this.socket = new WebSocket(`${WS_BASE}/ws/${encodeURIComponent(session.roomCode)}?${params}`);
    this.socket.addEventListener('message', (event) => this.onMessage(event.data));
  }

  onMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.type === 'ack' && message.requestId) {
      const entry = this.pending.get(message.requestId);
      if (entry) {
        this.pending.delete(message.requestId);
        clearTimeout(entry.timer);
        entry.resolve(message.result);
      }
      return;
    }
    if (message.type === 'event') this.events.push(message);
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket open timed out')), 5000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('WebSocket open failed'));
      }, { once: true });
    });
  }

  request(event, payload = {}) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${event} ack timed out`));
      }, 5000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ event, payload, requestId }));
    });
  }

  close() {
    try { this.socket.close(1000, 'test complete'); } catch {}
  }
}

await waitForHealth();

const first = await autoJoin(`CI-A-${Date.now().toString().slice(-5)}`);
const second = await autoJoin(`CI-B-${Date.now().toString().slice(-5)}`);

assert.equal(second.session.roomCode, first.session.roomCode, 'Two players should auto-match into the same room');
assert.equal(second.room.players.length, 2, 'Room should contain two players');

const peer1 = new Peer(first.session);
const peer2 = new Peer(second.session);

try {
  await Promise.all([peer1.open(), peer2.open()]);

  const [resume1, resume2] = await Promise.all([
    peer1.request('room:resume', first.session),
    peer2.request('room:resume', second.session),
  ]);
  assert.equal(resume1.ok, true);
  assert.equal(resume2.ok, true);
  assert.equal(resume1.room.players.length, 2);

  const start = await peer1.request('room:start');
  assert.equal(start.ok, true, start.message);
  assert.equal(start.room.phase, 'profession');

  const pick1 = await peer1.request('room:chooseProfession', { profession: 'doctor' });
  assert.equal(pick1.ok, true, pick1.message);
  const pick2 = await peer2.request('room:chooseProfession', { profession: 'engineer' });
  assert.equal(pick2.ok, true, pick2.message);
  assert.equal(pick2.room.phase, 'game');
  assert.equal(pick2.room.game.round, 1);
  assert.equal(pick2.room.game.stockPrice, 10);
  assert.equal(pick2.room.game.landPrice, 10);
  assert.ok(pick2.room.game.currentPlayerId);
  assert.ok(pick2.room.game.turnId);

  const currentId = pick2.room.game.currentPlayerId;
  const currentPeer = currentId === first.session.playerId ? peer1 : peer2;
  const action = await currentPeer.request('game:action', {
    action: 'salary',
    turnId: pick2.room.game.turnId,
  });
  assert.equal(action.ok, true, action.message);
  assert.equal(action.room.game.lastEvent.type, 'salary');
  assert.ok(action.room.game.lastEvent.diceTotal >= 1);
  assert.ok(action.room.game.showcaseUntil > Date.now());

  console.log(`Cloudflare integration passed in room ${first.session.roomCode}`);
} finally {
  peer1.close();
  peer2.close();
}

process.exit(0);
