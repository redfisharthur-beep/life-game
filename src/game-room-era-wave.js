import { GameRoom as RecoveryGameRoom } from './game-room-recovery.js';

export class GameRoom extends RecoveryGameRoom {
  applyMajorEvent(room, event) {
    if (event?.id === 'eraWave') {
      room.game.forceTripleDice = true;
      room.game.forceDoubleDice = false;
      return;
    }
    return super.applyMajorEvent(room, event);
  }

  publicRoom(room) {
    const snapshot = super.publicRoom(room);
    if (!snapshot?.game) return snapshot;

    snapshot.game.forceTripleDice = Boolean(room?.game?.forceTripleDice);

    if (snapshot.game.majorEvent?.id === 'eraWave') {
      snapshot.game.majorEvent.description = '從現在開始，後續所有骰子都改為3顆';
    }

    if (snapshot.game.lastEvent?.type === 'majorEvent' && snapshot.game.lastEvent?.eventId === 'eraWave') {
      snapshot.game.lastEvent = {
        ...snapshot.game.lastEvent,
        text: String(snapshot.game.lastEvent.text || '').replace(/2顆/g, '3顆'),
      };
    }

    return snapshot;
  }

  async withTripleDice(room, operation) {
    if (!room?.game?.forceTripleDice || Number(room.game.round || 1) >= 21) {
      return operation();
    }

    const actualRound = Number(room.game.round || 1);
    let firstRead = true;

    Object.defineProperty(room.game, 'round', {
      configurable: true,
      enumerable: true,
      get() {
        if (firstRead) {
          firstRead = false;
          return 21;
        }
        return actualRound;
      },
      set() {},
    });

    try {
      return await operation();
    } finally {
      Object.defineProperty(room.game, 'round', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: actualRound,
      });
    }
  }

  async settleSalary(room, playerId, auto = false) {
    return this.withTripleDice(room, () => super.settleSalary(room, playerId, auto));
  }

  async settleMarketAction(room, playerId, action) {
    return this.withTripleDice(room, () => super.settleMarketAction(room, playerId, action));
  }

  async settleFate(room, playerId) {
    return this.withTripleDice(room, () => super.settleFate(room, playerId));
  }

  async settleSabotage(room, playerId) {
    return this.withTripleDice(room, () => super.settleSabotage(room, playerId));
  }

  async settleHelp(room, playerId) {
    return this.withTripleDice(room, () => super.settleHelp(room, playerId));
  }

  async settleDream(room, playerId) {
    return this.withTripleDice(room, () => super.settleDream(room, playerId));
  }
}
