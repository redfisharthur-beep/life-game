import { GameRoom as RulesGameRoom } from './game-room-rules-v2.js';

export class GameRoom extends RulesGameRoom {
  async recoverExpiredGameState(room) {
    if (!room?.game || room.phase !== 'game' || room.game.finished) return false;

    const game = room.game;
    const now = Date.now();

    // 重大事件已過期但 Alarm 未推進：補跑回合結束流程。
    if (Number(game.majorEventUntil || 0) > 0 && Number(game.majorEventUntil) <= now) {
      const completedRound = game.round;
      const marketText = game.pendingMarketText || null;
      game.pendingMarketText = null;
      game.majorEvent = null;
      game.majorEventUntil = null;
      await this.continueAfterRound(room, completedRound, marketText);
      return true;
    }

    // 11／21 回合骰數切換轉場已過期：直接開始下一個有效回合。
    if (Number(game.transitionUntil || 0) > 0 && Number(game.transitionUntil) <= now) {
      game.transitionUntil = null;
      await this.beginTurn(room);
      return true;
    }

    // 行動結果動畫已過期：補做下一位玩家／下一輪推進。
    if (Number(game.showcaseUntil || 0) > 0 && Number(game.showcaseUntil) <= now) {
      game.showcaseUntil = null;
      if (this.hasReachedHappinessGoal(room)) {
        await this.finishGame(room, 'happiness');
        return true;
      }
      game.turnIndex = Number(game.turnIndex || 0) + 1;
      await this.beginTurn(room);
      return true;
    }

    // 玩家回合 deadline 已過期：補做逾時自動領薪。
    if (Number(game.deadline || 0) > 0 && Number(game.deadline) <= now) {
      const playerId = game.currentPlayerId;
      const turnId = game.turnId;
      if (playerId && turnId && this.claimTurn(room, playerId, turnId)) {
        await this.settleSalary(room, playerId, true);
        return true;
      }

      // deadline 過期但 turn token 已異常，直接重建該回合。
      game.deadline = null;
      game.turnProcessed = false;
      await this.beginTurn(room);
      return true;
    }

    // 結構性卡死：仍在遊戲中，卻完全沒有任何正在等待的狀態。
    const hasWaitingState = Boolean(
      Number(game.deadline || 0)
      || Number(game.showcaseUntil || 0)
      || Number(game.transitionUntil || 0)
      || Number(game.majorEventUntil || 0)
    );

    if (!hasWaitingState) {
      game.turnProcessed = false;
      await this.beginTurn(room);
      return true;
    }

    return false;
  }

  async handleSocketEvent(socket, attachment, message) {
    // 重新整理／自動重連時，在回傳房間狀態前先自我修復。
    if (String(message?.event || '') === 'room:resume') {
      const room = await this.getRoom();
      await this.recoverExpiredGameState(room);
    }
    return super.handleSocketEvent(socket, attachment, message);
  }

  async alarm() {
    // 先讓原本 Alarm 正常執行，再補一層失敗保護。
    await super.alarm();
    const room = await this.getRoom();
    await this.recoverExpiredGameState(room);
  }
}
