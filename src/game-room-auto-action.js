import { GameRoom as MilestoneGameRoom } from './game-room-milestones.js';

const AUTO_ACTIONS = [
  'salary',
  'buyStock',
  'buyLand',
  'fate',
  'sabotage',
  'help',
  'sellStock',
  'sellLand',
  'dream',
];

function randomChoice(values) {
  return values.length ? values[Math.floor(Math.random() * values.length)] : null;
}

export class GameRoom extends MilestoneGameRoom {
  getAvailableAutoActions(room, playerId) {
    return AUTO_ACTIONS.filter((action) => {
      if (action === 'sabotage') {
        return room.players.length >= 2 && Boolean(this.chooseSabotageTarget(room, playerId));
      }
      if (action === 'help') {
        return this.getHelpCandidates(room, playerId).length > 0;
      }
      return true;
    });
  }

  async settleRandomAutoAction(room, playerId, reason = 'timeout') {
    const player = room.players.find((item) => item.id === playerId);
    if (!player || !room?.game) return false;

    const action = randomChoice(this.getAvailableAutoActions(room, playerId));
    if (!action) return false;

    let settled = false;
    if (action === 'salary') settled = await super.settleSalary(room, playerId, false);
    else if (['buyStock', 'buyLand', 'sellStock', 'sellLand'].includes(action)) {
      settled = await super.settleMarketAction(room, playerId, action);
    } else if (action === 'fate') settled = await super.settleFate(room, playerId);
    else if (action === 'sabotage') settled = await super.settleSabotage(room, playerId);
    else if (action === 'help') settled = await super.settleHelp(room, playerId);
    else if (action === 'dream') settled = await super.settleDream(room, playerId);

    if (settled && room.game.lastEvent) {
      room.game.lastEvent.auto = true;
      room.game.lastEvent.autoAction = action;
      room.game.lastEvent.autoReason = reason;
    }
    return settled;
  }

  // 原本所有「逾時自動領薪」入口都會呼叫 settleSalary(..., true)。
  // 改成從 9 個行動中隨機選一項，確保 Alarm、重連修復與逾時點擊都一致。
  async settleSalary(room, playerId, auto = false) {
    if (!auto) return super.settleSalary(room, playerId, false);
    const player = room.players.find((item) => item.id === playerId);
    return this.settleRandomAutoAction(room, playerId, player?.connected ? 'timeout' : 'offline');
  }

  // 輪到已離線玩家時不必再空等倒數，直接隨機執行一項行動。
  async beginTurn(room) {
    await super.beginTurn(room);

    if (!room?.game || room.phase !== 'game' || room.game.finished) return;
    const playerId = room.game.currentPlayerId;
    const turnId = room.game.turnId;
    if (!playerId || !turnId || room.game.turnProcessed || !room.game.deadline) return;

    const player = room.players.find((item) => item.id === playerId);
    if (!player || player.connected) return;

    if (this.claimTurn(room, playerId, turnId)) {
      const settled = await this.settleRandomAutoAction(room, playerId, 'offline');
      if (!settled) {
        room.game.turnProcessed = false;
        await super.settleSalary(room, playerId, false);
      }
    }
  }
}
