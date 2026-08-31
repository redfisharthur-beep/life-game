import { GameRoom as AutoActionGameRoom } from './game-room-auto-action.js';

const PROFESSION_AUTO_PICK_MS = 60_000;
const FINISHED_ROOM_TTL_MS = 180_000;
const MAX_VOICE_SIGNAL_BYTES = 64_000;
const JOIN_SOCKET_GRACE_MS = 15_000;

export class GameRoom extends AutoActionGameRoom {
  getLivePlayerIds(excludeSocket = null) {
    const ids = new Set();
    for (const socket of this.state.getWebSockets()) {
      if (excludeSocket && socket === excludeSocket) continue;
      const attachment = socket.deserializeAttachment?.() || {};
      if (attachment.playerId) ids.add(String(attachment.playerId));
    }
    return ids;
  }

  async syncMatchmaker(room) {
    try {
      const liveIds = this.getLivePlayerIds();
      const onlinePlayers = (room?.players || []).filter((player) => liveIds.has(String(player.id)));
      const host = onlinePlayers.find((player) => player.id === room.hostId) || onlinePlayers[0] || null;
      const id = this.env.MATCHMAKER.idFromName('global');
      const stub = this.env.MATCHMAKER.get(id);
      await stub.fetch('https://matchmaker.internal/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: room.code,
          count: onlinePlayers.length,
          started: Boolean(room.started && onlinePlayers.length > 0),
          hostName: host?.name || '',
        }),
      });
    } catch (error) {
      console.error('Matchmaker sync failed', error);
    }
  }

  async join(name, code, skipSync = false) {
    // 加入新玩家前先清理舊版本遺留的幽靈玩家。新版本玩家會有 joinedAt，
    // 並保留 15 秒等待瀏覽器建立 WebSocket，避免 HTTP join 與 WS 連線之間被誤刪。
    let room = await this.getRoom(code);
    const liveIds = this.getLivePlayerIds();
    const now = Date.now();
    const staleIds = (room?.players || [])
      .filter((player) => {
        if (liveIds.has(String(player.id))) return false;
        const joinedAt = Number(player.joinedAt || 0);
        return !joinedAt || (now - joinedAt) > JOIN_SOCKET_GRACE_MS;
      })
      .map((player) => player.id);

    for (const playerId of staleIds) {
      room = await this.getRoom(code);
      if (!room.players.some((player) => player.id === playerId)) continue;
      await this.removePlayer(room, playerId);
    }

    room = await this.getRoom(code);
    if (!room.players.length && room.started) {
      room.started = false;
      room.phase = 'lobby';
      room.professionDeadline = null;
      room.finishedCleanupAt = null;
      room.game = null;
      room.hostId = null;
      await this.saveRoom(room);
      await this.syncMatchmaker(room);
    }

    const result = await super.join(name, code, skipSync);
    if (result?.ok && result?.session?.playerId) {
      const latest = await this.getRoom(code);
      const player = latest.players.find((item) => item.id === result.session.playerId);
      if (player) {
        player.joinedAt = Date.now();
        await this.saveRoom(latest);
      }
    }
    return result;
  }

  async reconcilePresence({ destructive = false } = {}) {
    let room = await this.getRoom();
    const liveIds = this.getLivePlayerIds();
    const now = Date.now();

    if (destructive && room.phase !== 'finished') {
      const staleIds = room.players
        .filter((player) => {
          if (liveIds.has(String(player.id))) return false;
          const joinedAt = Number(player.joinedAt || 0);
          return !joinedAt || (now - joinedAt) > JOIN_SOCKET_GRACE_MS;
        })
        .map((player) => player.id);

      for (const playerId of staleIds) {
        const latest = await this.getRoom();
        if (!latest.players.some((player) => player.id === playerId)) continue;
        await this.removePlayer(latest, playerId);
      }
      room = await this.getRoom();
    }

    const currentLiveIds = this.getLivePlayerIds();
    let changed = false;
    for (const player of room.players) {
      const online = currentLiveIds.has(String(player.id));
      if (player.connected !== online) {
        player.connected = online;
        if (online) player.disconnectDeadline = null;
        changed = true;
      }
    }

    if (!room.players.length && room.phase !== 'finished') {
      room.hostId = null;
      room.started = false;
      room.phase = 'lobby';
      room.professionDeadline = null;
      room.game = null;
      changed = true;
    } else if (!room.players.some((player) => player.id === room.hostId)) {
      room.hostId = room.players.find((player) => currentLiveIds.has(String(player.id)))?.id
        || room.players[0]?.id
        || null;
      changed = true;
    }

    if (changed) await this.saveRoom(room);

    const onlinePlayers = room.players.filter((player) => currentLiveIds.has(String(player.id)));
    const onlineHost = onlinePlayers.find((player) => player.id === room.hostId) || onlinePlayers[0] || null;
    return {
      room,
      status: {
        ok: true,
        phase: room.phase || 'lobby',
        count: onlinePlayers.length,
        storedCount: room.players.length,
        started: Boolean(room.started && onlinePlayers.length > 0),
        hostName: onlineHost?.name || '',
      },
    };
  }

  getNextDeadline(room) {
    const parentDeadline = super.getNextDeadline(room);
    const finishedCleanupAt = room?.phase === 'finished'
      ? Number(room.finishedCleanupAt || 0)
      : 0;

    if (finishedCleanupAt > Date.now()) {
      if (!parentDeadline) return finishedCleanupAt;
      return Math.min(parentDeadline, finishedCleanupAt);
    }
    return parentDeadline;
  }

  async resetFinishedRoom(room) {
    if (!room || room.phase !== 'finished') return false;

    room.players = [];
    room.hostId = null;
    room.started = false;
    room.phase = 'lobby';
    room.professionDeadline = null;
    room.finishedCleanupAt = null;
    room.game = null;

    await this.saveRoom(room);
    await this.syncMatchmaker(room);
    try { await this.state.storage.deleteAlarm(); } catch (_) {}

    for (const socket of this.state.getWebSockets()) {
      try { socket.close(1000, 'finished room expired'); } catch (_) {}
    }
    return true;
  }

  async finishGame(room, reason = 'rounds') {
    await super.finishGame(room, reason);
    room.finishedCleanupAt = Date.now() + FINISHED_ROOM_TTL_MS;
    await this.saveRoom(room);
    await this.syncMatchmaker(room);
    await this.reschedule(room);
  }

  async enforceProfessionDeadline() {
    const room = await this.getRoom();
    if (room?.phase !== 'profession') return;

    const now = Date.now();
    const current = Number(room.professionDeadline || 0);
    const maxDeadline = now + PROFESSION_AUTO_PICK_MS;

    if (!current || current > maxDeadline) {
      room.professionDeadline = maxDeadline;
      await this.saveRoom(room);
      if (typeof this.reschedule === 'function') await this.reschedule(room);
    }
  }

  async removePlayer(room, playerId) {
    const wasProfession = room?.phase === 'profession';
    await super.removePlayer(room, playerId);

    let latest = await this.getRoom();

    if (wasProfession && latest?.phase === 'profession' && latest.players.length < 2) {
      latest.started = false;
      latest.phase = 'lobby';
      latest.professionDeadline = null;
      latest.game = null;
      latest.players.forEach((player) => {
        player.profession = null;
        player.disconnectDeadline = null;
      });
      if (!latest.players.some((player) => player.id === latest.hostId)) {
        latest.hostId = latest.players[0]?.id || null;
      }
      await this.broadcastRoom(latest);
      latest = await this.getRoom();
    }

    await this.syncMatchmaker(latest);
    if (typeof this.reschedule === 'function') await this.reschedule(latest);
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment?.() || {};
    const room = await this.getRoom();
    const player = room?.players?.find((item) => item.id === attachment.playerId);
    if (!player) return;

    const stillConnected = this.getLivePlayerIds(socket).has(String(player.id));

    if (stillConnected) {
      player.connected = true;
      player.disconnectDeadline = null;
      await this.saveRoom(room);
      this.broadcast('room:update', this.publicRoom(room));
      await this.reschedule(room);
      return;
    }

    if (room.phase !== 'finished') {
      player.connected = false;
      player.disconnectDeadline = null;
      await this.removePlayer(room, player.id);
      return;
    }

    await super.webSocketClose(socket);
    const latest = await this.getRoom();
    await this.syncMatchmaker(latest);
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  async handleVoiceEvent(socket, attachment, message) {
    const event = String(message?.event || '');
    if (event !== 'voice:signal' && event !== 'voice:announce') return false;

    const room = await this.getRoom();
    const player = this.findPlayer(room, attachment?.playerId, attachment?.reconnectToken);
    const requestId = message?.requestId || null;
    if (!player) {
      this.ack(socket, requestId, { ok: false, message: '語音玩家驗證失敗。' });
      return true;
    }

    if (event === 'voice:announce') {
      const enabled = Boolean(message?.payload?.enabled);
      const packet = {
        type: 'event',
        event: 'voice:announce',
        data: { playerId: player.id, enabled },
      };
      for (const candidate of this.state.getWebSockets()) {
        this.send(candidate, packet);
      }
      this.ack(socket, requestId, { ok: true });
      return true;
    }

    const targetPlayerId = String(message?.payload?.targetPlayerId || '');
    const signal = message?.payload?.signal;
    if (!targetPlayerId || !room.players.some((item) => item.id === targetPlayerId) || !signal) {
      this.ack(socket, requestId, { ok: false, message: '語音訊號目標不存在。' });
      return true;
    }

    let serialized = '';
    try { serialized = JSON.stringify(signal); } catch (_) {}
    if (!serialized || serialized.length > MAX_VOICE_SIGNAL_BYTES) {
      this.ack(socket, requestId, { ok: false, message: '語音訊號格式無效。' });
      return true;
    }

    const packet = {
      type: 'event',
      event: 'voice:signal',
      data: { fromPlayerId: player.id, signal },
    };
    let delivered = 0;
    for (const candidate of this.state.getWebSockets()) {
      const targetAttachment = candidate.deserializeAttachment?.() || {};
      if (targetAttachment.playerId !== targetPlayerId) continue;
      this.send(candidate, packet);
      delivered += 1;
    }

    this.ack(socket, requestId, { ok: delivered > 0, delivered });
    return true;
  }

  async handleSocketEvent(socket, attachment, message) {
    const event = String(message?.event || '');

    if (await this.handleVoiceEvent(socket, attachment, message)) return;

    await super.handleSocketEvent(socket, attachment, message);

    if (event === 'room:start' || event === 'game:restart' || event === 'room:resume') {
      await this.enforceProfessionDeadline();
    }
  }

  async alarm() {
    let room = await this.getRoom();
    if (
      room?.phase === 'finished'
      && Number(room.finishedCleanupAt || 0) > 0
      && Number(room.finishedCleanupAt) <= Date.now()
    ) {
      await this.resetFinishedRoom(room);
      return;
    }

    await super.alarm();

    room = await this.getRoom();
    if (
      room?.phase === 'finished'
      && Number(room.finishedCleanupAt || 0) > 0
      && Number(room.finishedCleanupAt) <= Date.now()
    ) {
      await this.resetFinishedRoom(room);
      return;
    }
    await this.reschedule(room);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/internal/presence' && request.method === 'POST') {
      const { room, status } = await this.reconcilePresence({ destructive: true });
      await this.syncMatchmaker(room);
      return new Response(JSON.stringify(status), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    if (url.pathname === '/internal/reap-finished' && request.method === 'POST') {
      const room = await this.getRoom();
      if (room?.phase === 'finished') {
        await this.resetFinishedRoom(room);
        return new Response(JSON.stringify({ ok: true, reaped: true, phase: 'lobby', count: 0, started: false }), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      const { status } = await this.reconcilePresence({ destructive: true });
      return new Response(JSON.stringify({ ...status, reaped: false }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const response = await super.fetch(request);
    if (url.pathname === '/ws' && response.status === 101) {
      const latest = await this.getRoom();
      await this.syncMatchmaker(latest);
    }
    return response;
  }
}
