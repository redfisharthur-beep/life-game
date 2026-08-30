import { GameRoom as EraWaveGameRoom } from './game-room-era-wave.js';

const MILESTONES = [
  { id: 'assets-5000', type: 'assets', threshold: 5000, happiness: 3, label: '總資產達 5,000' },
  { id: 'assets-10000', type: 'assets', threshold: 10000, happiness: 5, label: '總資產達 10,000' },
  { id: 'assets-15000', type: 'assets', threshold: 15000, happiness: 5, label: '總資產達 15,000' },
  { id: 'land-100', type: 'land', threshold: 100, happiness: 3, label: '土地達 100' },
  { id: 'land-200', type: 'land', threshold: 200, happiness: 5, label: '土地達 200' },
  { id: 'land-300', type: 'land', threshold: 300, happiness: 5, label: '土地達 300' },
  { id: 'stocks-100', type: 'stocks', threshold: 100, happiness: 3, label: '股票達 100' },
  { id: 'stocks-200', type: 'stocks', threshold: 200, happiness: 5, label: '股票達 200' },
  { id: 'stocks-300', type: 'stocks', threshold: 300, happiness: 5, label: '股票達 300' },
];

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export class GameRoom extends EraWaveGameRoom {
  async initializeGame(room) {
    room.players.forEach((player) => { player.happinessMilestones = []; });
    await super.initializeGame(room);
  }

  milestoneValue(player, room, type) {
    if (type === 'assets') return this.playerAssets(player, room.game);
    if (type === 'land') return Number(player.land || 0);
    if (type === 'stocks') return Number(player.stocks || 0);
    return 0;
  }

  applyHappinessMilestones(room, players = room?.players || []) {
    if (!room?.game) return [];
    const awards = [];

    players.forEach((player) => {
      const earned = new Set(Array.isArray(player.happinessMilestones) ? player.happinessMilestones : []);
      MILESTONES.forEach((milestone) => {
        if (earned.has(milestone.id)) return;
        if (this.milestoneValue(player, room, milestone.type) < milestone.threshold) return;

        earned.add(milestone.id);
        player.happiness = round2(Number(player.happiness || 0) + milestone.happiness);
        awards.push({
          playerId: player.id,
          milestoneId: milestone.id,
          label: milestone.label,
          happiness: milestone.happiness,
        });
      });
      player.happinessMilestones = [...earned];
    });

    return awards;
  }

  attachMilestoneAwards(room, awards) {
    if (!awards.length || !room?.game?.lastEvent) return;
    const playerId = room.game.lastEvent.playerId;
    const ownAwards = awards.filter((award) => award.playerId === playerId);
    if (!ownAwards.length) return;
    const happinessGain = ownAwards.reduce((sum, award) => sum + award.happiness, 0);
    room.game.lastEvent.milestones = ownAwards;
    room.game.lastEvent.milestoneHappinessGain = happinessGain;
    room.game.lastEvent.text = `${room.game.lastEvent.text}；里程碑幸福 +${happinessGain}`;
  }

  async advanceTurn(room) {
    const player = room.players.find((item) => item.id === room.game?.currentPlayerId);
    const awards = this.applyHappinessMilestones(room, player ? [player] : []);
    this.attachMilestoneAwards(room, awards);
    return super.advanceTurn(room);
  }

  updateMarket(room) {
    const text = super.updateMarket(room);
    this.applyHappinessMilestones(room);
    return text;
  }

  applyMajorEvent(room, event) {
    const result = super.applyMajorEvent(room, event);
    this.applyHappinessMilestones(room);
    return result;
  }

  async continueAfterRound(room, completedRound, marketText) {
    if (this.hasReachedHappinessGoal(room)) {
      await this.finishGame(room, 'happiness');
      return;
    }
    return super.continueAfterRound(room, completedRound, marketText);
  }
}
