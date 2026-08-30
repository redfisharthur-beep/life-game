const MAX_PLAYERS = 6;

const PROFESSIONS = new Set([
  'doctor',
  'engineer',
  'sales',
  'office',
  'athlete',
  'rich',
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 12);
}

function createToken() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async getRoom(code = '') {
    const saved = await this.state.storage.get('room');
    if (saved) return saved;
    return {
      code: String(code || '').toUpperCase(),
      hostId: null,
      players: [],
      started: false,
      phase: 'lobby',
      game: null,
    };
  }

  async saveRoom(room) {
    await this.state.storage.put('room', room);
  }

  publicRoom(room) {
    const allReady = room.started
      && room.players.length >= 2
      && room.players.every((player) => Boolean(player.profession));

    return {
      code: room.code,
      hostId: room.hostId,
      serverTime: Date.now(),
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        profession: player.profession || null,
        connected: Boolean(player.connected),
        cash: Number(player.cash || 0),
        stocks: Number(player.stocks || 0),
        land: Number(player.land || 0),
        happiness: Number(player.happiness || 0),
        helpCount: Number(player.helpCount || 0),
        sabotageCount: Number(player.sabotageCount || 0),
        totalAssets: 0,
      })),
      maxPlayers: MAX_PLAYERS,
      started: Boolean(room.started),
      phase: room.phase || 'lobby',
      allReady,
      game: room.game || null,
    };
  }

  sessionPayload(room, player) {
    return {
      roomCode: room.code,
      playerId: player.id,
      reconnectToken: player.reconnectToken,
      name: player.name,
    };
  }

  findPlayer(room, playerId, reconnectToken) {
    return room.players.find((player) => (
      player.id === String(playerId || '')
      && player.reconnectToken === String(reconnectToken || '')
    ));
  }

  async syncMatchmaker(room) {
    try {
      const id = this.env.MATCHMAKER.idFromName('global');
      const stub = this.env.MATCHMAKER.get(id);
      await stub.fetch('https://matchmaker.internal/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: room.code,
          count: room.players.length,
          started: Boolean(room.started),
        }),
      });
    } catch (error) {
      console.error('Matchmaker sync failed', error);
    }
  }

  send(socket, message) {
    try {
      socket.send(JSON.stringify(message));
    } catch (_) {
      // Socket may have closed between enumeration and send.
    }
  }

  broadcast(event, data) {
    const message = { type: 'event', event, data };
    this.state.getWebSockets().forEach((socket) => this.send(socket, message));
  }

  ack(socket, requestId, result) {
    if (!requestId) return;
    this.send(socket, { type: 'ack', requestId, result });
  }

  async join(name, code) {
    const clean = cleanName(name);
    if (!clean) return { ok: false, message: '請輸入暱稱' };

    const room = await this.getRoom(code);
    if (!room.code) room.code = String(code || '').toUpperCase();
    if (room.started) return { ok: false, reason: 'started', message: '這個房間已經開始遊戲。' };
    if (room.players.length >= MAX_PLAYERS) return { ok: false, reason: 'full', message: '這個房間已滿。' };
    if (room.players.some((player) => player.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, reason: 'nameTaken', message: '這個暱稱在房間內已有人使用。' };
    }

    const player = {
      id: crypto.randomUUID(),
      reconnectToken: createToken(),
      connected: false,
      name: clean,
      profession: null,
      cash: 0,
      stocks: 0,
      land: 0,
      happiness: 0,
      helpCount: 0,
      sabotageCount: 0,
    };

    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    await this.saveRoom(room);

    return {
      ok: true,
      room: this.publicRoom(room),
      session: this.sessionPayload(room, player),
    };
  }

  async handleSocketEvent(socket, attachment, message) {
    const event = String(message?.event || '');
    const payload = message?.payload || {};
    const requestId = message?.requestId || null;
    const room = await this.getRoom();
    const player = this.findPlayer(room, attachment.playerId, attachment.reconnectToken);

    if (!player) {
      this.ack(socket, requestId, { ok: false, message: '玩家驗證失敗，請重新加入。' });
      return;
    }

    if (event === 'room:resume') {
      player.connected = true;
      await this.saveRoom(room);
      const snapshot = this.publicRoom(room);
      this.ack(socket, requestId, {
        ok: true,
        room: snapshot,
        session: this.sessionPayload(room, player),
      });
      this.broadcast('room:update', snapshot);
      return;
    }

    if (event === 'room:start') {
      if (room.hostId !== player.id) {
        this.ack(socket, requestId, { ok: false, message: '只有房主可以啟程。' });
        return;
      }
      if (room.started) {
        this.ack(socket, requestId, { ok: true, room: this.publicRoom(room) });
        return;
      }
      if (room.players.length < 2) {
        this.ack(socket, requestId, { ok: false, message: '至少需要2位玩家才能啟程。' });
        return;
      }

      room.started = true;
      room.phase = 'profession';
      room.players.forEach((item) => { item.profession = null; });
      await this.saveRoom(room);
      await this.syncMatchmaker(room);
      const snapshot = this.publicRoom(room);
      this.ack(socket, requestId, { ok: true, room: snapshot });
      this.broadcast('room:started', snapshot);
      this.broadcast('room:update', snapshot);
      return;
    }

    if (event === 'room:chooseProfession') {
      const professionId = String(payload?.profession || '');
      if (room.phase !== 'profession') {
        this.ack(socket, requestId, { ok: false, message: '目前還不能選擇職業。' });
        return;
      }
      if (!PROFESSIONS.has(professionId)) {
        this.ack(socket, requestId, { ok: false, message: '這個職業不存在。' });
        return;
      }
      if (room.players.some((item) => item.id !== player.id && item.profession === professionId)) {
        this.ack(socket, requestId, { ok: false, message: '這個職業已被其他玩家選走。' });
        return;
      }

      player.profession = professionId;
      await this.saveRoom(room);
      const snapshot = this.publicRoom(room);
      this.ack(socket, requestId, { ok: true, room: snapshot });
      this.broadcast('room:update', snapshot);
      return;
    }

    if (event === 'room:leave') {
      room.players = room.players.filter((item) => item.id !== player.id);
      if (room.hostId === player.id) room.hostId = room.players[0]?.id || null;
      if (!room.players.length) {
        room.started = false;
        room.phase = 'lobby';
        room.game = null;
      }
      await this.saveRoom(room);
      await this.syncMatchmaker(room);
      const snapshot = this.publicRoom(room);
      this.ack(socket, requestId, { ok: true });
      this.broadcast('room:update', snapshot);
      try { socket.close(1000, 'left room'); } catch (_) {}
      return;
    }

    if (event === 'game:action' || event === 'game:restart') {
      this.ack(socket, requestId, {
        ok: false,
        room: this.publicRoom(room),
        message: 'Cloudflare 遊戲回合系統正在遷移中。',
      });
      return;
    }

    this.ack(socket, requestId, { ok: false, message: '未知的房間事件。' });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      const code = url.searchParams.get('code') || 'UNKNOWN';
      const room = await this.getRoom(code);
      return json({
        ok: true,
        durableObject: 'GameRoom',
        room: code,
        players: room.players.length,
        phase: room.phase,
      });
    }

    if (url.pathname === '/internal/join' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      return json(await this.join(payload.name, payload.code));
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const room = await this.getRoom();
      const playerId = url.searchParams.get('playerId');
      const reconnectToken = url.searchParams.get('reconnectToken');
      const player = this.findPlayer(room, playerId, reconnectToken);
      if (!player) return new Response('Unauthorized player', { status: 401 });

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      server.serializeAttachment({
        playerId: player.id,
        reconnectToken: player.reconnectToken,
      });

      player.connected = true;
      await this.saveRoom(room);
      const snapshot = this.publicRoom(room);
      this.broadcast('room:update', snapshot);
      this.send(server, {
        type: 'event',
        event: 'server:ready',
        data: { message: 'Cloudflare 房間連線成功', playerId: player.id },
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('GameRoom is ready', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  async webSocketMessage(socket, rawMessage) {
    let message;
    try {
      message = JSON.parse(typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage));
    } catch (_) {
      return;
    }

    const attachment = socket.deserializeAttachment() || {};
    await this.handleSocketEvent(socket, attachment, message);
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment() || {};
    const room = await this.getRoom();
    const player = room.players.find((item) => item.id === attachment.playerId);
    if (!player) return;

    const stillConnected = this.state.getWebSockets().some((candidate) => {
      if (candidate === socket) return false;
      const data = candidate.deserializeAttachment?.() || {};
      return data.playerId === player.id;
    });

    player.connected = stillConnected;
    await this.saveRoom(room);
    this.broadcast('room:update', this.publicRoom(room));
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }
}
