import { GameRoom as AutoActionGameRoom } from './game-room-auto-action.js';

const PROFESSION_AUTO_PICK_MS = 60_000;

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
}
