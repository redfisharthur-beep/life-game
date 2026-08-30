import { GameRoom as AutoActionGameRoom } from './game-room-auto-action.js';

const PROFESSION_AUTO_PICK_MS = 60_000;
const FINISHED_ROOM_TTL_MS = 180_000;

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

  async handleSocketEvent(socket, attachment, message) {
    const event = String(message?.event || '');
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
