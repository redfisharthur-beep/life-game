import { GameRoom as CoreGameRoom } from './game-room.js';

const DISCONNECT_GRACE_MS = 90_000;

export class GameRoom extends CoreGameRoom {
  async scheduleAt(timestamp) {
    if (!timestamp) return;
    const target = Math.max(Date.now() + 1, Number(timestamp));
    const current = await this.state.storage.getAlarm();
    if (current == null || target < current) {
      await this.state.storage.setAlarm(target);
    }
  }

  getNextDeadline(room) {
    const deadlines = [];
    const add = (value) => {
      const number = Number(value || 0);
      if (number > Date.now()) deadlines.push(number);
    };

    if (room?.phase === 'profession') add(room.professionDeadline);

    if (room?.phase === 'game' && room.game && !room.game.finished) {
      add(room.game.deadline);
      add(room.game.showcaseUntil);
      add(room.game.transitionUntil);
      add(room.game.majorEventUntil);
    }

    if (room?.phase === 'lobby' || room?.phase === 'profession') {
      room.players?.forEach((player) => add(player.disconnectDeadline));
    }

    return deadlines.length ? Math.min(...deadlines) : null;
  }

  async reschedule(room) {
    const next = this.getNextDeadline(room);
    if (next == null) {
      const current = await this.state.storage.getAlarm();
      if (current != null) await this.state.storage.deleteAlarm();
      return;
    }
    await this.state.storage.setAlarm(Math.max(Date.now() + 1, next));
  }

  async clearDisconnectDeadline(player, room) {
    if (!player?.disconnectDeadline) return;
    player.disconnectDeadline = null;
    await this.saveRoom(room);
    await this.reschedule(room);
  }

  async handleSocketEvent(socket, attachment, message) {
    if (String(message?.event || '') === 'room:resume') {
      const room = await this.getRoom();
      const player = this.findPlayer(room, attachment.playerId, attachment.reconnectToken);
      if (player?.disconnectDeadline) {
        player.disconnectDeadline = null;
        await this.saveRoom(room);
      }
    }

    await super.handleSocketEvent(socket, attachment, message);
    const latest = await this.getRoom();
    await this.reschedule(latest);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      const room = await this.getRoom();
      const player = this.findPlayer(
        room,
        url.searchParams.get('playerId'),
        url.searchParams.get('reconnectToken'),
      );
      if (player?.disconnectDeadline) {
        player.disconnectDeadline = null;
        await this.saveRoom(room);
      }
    }

    const response = await super.fetch(request);
    if (url.pathname === '/ws' && response.status === 101) {
      const latest = await this.getRoom();
      await this.reschedule(latest);
    }
    return response;
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
    if (stillConnected) {
      player.disconnectDeadline = null;
    } else if (room.phase === 'lobby' || room.phase === 'profession') {
      player.disconnectDeadline = Date.now() + DISCONNECT_GRACE_MS;
    } else {
      player.disconnectDeadline = null;
    }

    await this.saveRoom(room);
    this.broadcast('room:update', this.publicRoom(room));
    await this.reschedule(room);
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }

  async removeExpiredDisconnectedPlayers(room) {
    if (room.phase !== 'lobby' && room.phase !== 'profession') return room;
    const now = Date.now();
    const expiredIds = room.players
      .filter((player) => (
        !player.connected
        && Number(player.disconnectDeadline || 0) > 0
        && Number(player.disconnectDeadline) <= now
      ))
      .map((player) => player.id);

    for (const playerId of expiredIds) {
      const latest = await this.getRoom();
      const player = latest.players.find((item) => item.id === playerId);
      if (!player || player.connected || Number(player.disconnectDeadline || 0) > Date.now()) continue;
      await this.removePlayer(latest, playerId);
    }

    return this.getRoom();
  }

  async alarm() {
    let room = await this.getRoom();
    room = await this.removeExpiredDisconnectedPlayers(room);
    await super.alarm();
    room = await this.getRoom();
    await this.reschedule(room);
  }
}
