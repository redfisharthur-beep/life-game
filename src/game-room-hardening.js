import { GameRoom as AutoActionGameRoom } from './game-room-auto-action.js';

const PROFESSION_AUTO_PICK_MS = 60_000;
const FINISHED_ROOM_TTL_MS = 180_000;
const MAX_VOICE_SIGNAL_BYTES = 64_000;

export class GameRoom extends AutoActionGameRoom {
  async syncMatchmaker(room) {
    try {
      const id = this.env.MATCHMAKER.idFromName('global');
      const stub = this.env.MATCHMAKER.get(id);
      const host = room?.players?.find((player) => player.id === room.hostId);
      await stub.fetch('https://matchmaker.internal/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: room.code,
          count: room.players.length,
          started: Boolean(room.started),
          hostName: host?.name || '',
        }),
      });
    } catch (error) {
      console.error('Matchmaker sync failed', error);
    }
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

    // 已結算房間到期後，後端直接切斷殘留連線；即使手機休眠、
    // 關頁或前端 timer 沒有執行，也不會繼續占住房間。
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

    // 舊版本可能曾寫入 5 分鐘 deadline；進到正式 production chain 後
    // 一律收斂到 60 秒內，避免玩家卡在職業選擇頁。
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

    // 選職業階段只剩 0～1 人時，不能繼續停在 profession。
    // 立即退回等待大廳，讓剩餘玩家重新等待其他人加入並可正常啟程。
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

    // 某些核心分支（例如遊戲中當前玩家離開）會提早 return，
    // 這裡統一補一次 Matchmaker 與 alarm 同步，避免房間人數殘留。
    await this.syncMatchmaker(latest);
    if (typeof this.reschedule === 'function') await this.reschedule(latest);
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment?.() || {};
    const room = await this.getRoom();
    const player = room?.players?.find((item) => item.id === attachment.playerId);
    if (!player) return;

    const stillConnected = this.state.getWebSockets().some((candidate) => {
      if (candidate === socket) return false;
      const data = candidate.deserializeAttachment?.() || {};
      return data.playerId === player.id;
    });

    // 同一玩家若還有另一個分頁／裝置連線，保留玩家。
    if (stillConnected) {
      player.connected = true;
      player.disconnectDeadline = null;
      await this.saveRoom(room);
      this.broadcast('room:update', this.publicRoom(room));
      await this.reschedule(room);
      return;
    }

    // 真正沒有任何連線時立即移出房間，不再保留 90 秒幽靈玩家。
    // lobby / profession / game 都適用；finished 則保留結果到 TTL 清理。
    if (room.phase !== 'finished') {
      player.connected = false;
      player.disconnectDeadline = null;
      await this.removePlayer(room, player.id);
      return;
    }

    await super.webSocketClose(socket);
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

    // Matchmaker 用來回收舊版本遺留下來、沒有 TTL alarm 的 finished 房。
    if (url.pathname === '/internal/reap-finished' && request.method === 'POST') {
      const room = await this.getRoom();
      if (room?.phase === 'finished') {
        await this.resetFinishedRoom(room);
        return new Response(JSON.stringify({ ok: true, reaped: true, phase: 'lobby', count: 0, started: false }), {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        reaped: false,
        phase: room?.phase || 'lobby',
        count: Number(room?.players?.length || 0),
        started: Boolean(room?.started),
      }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return super.fetch(request);
  }
}