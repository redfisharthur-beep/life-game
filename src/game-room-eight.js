import { GameRoom as StableGameRoom } from './game-room-stable.js';

const EXTRA_PROFESSIONS = {
  civilServant: { name: '公務員', salary: 6.5, stock: 1.5, land: 1.5, dream: 2.35 },
  artist: { name: '藝人', salary: 8, stock: 1.25, land: 0.75, dream: 2.55 },
};

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function rollDice(round, forceDoubleDice = false) {
  const diceCount = forceDoubleDice || round >= 16 ? 2 : 1;
  const dice = Array.from({ length: diceCount }, () => 1 + Math.floor(Math.random() * 6));
  return { dice, total: dice.reduce((sum, value) => sum + value, 0) };
}

export class GameRoom extends StableGameRoom {
  getProfession(player) {
    return EXTRA_PROFESSIONS[player?.profession] || null;
  }

  getActivePlayer(room, playerId) {
    const player = super.getActivePlayer(room, playerId);
    if (player) return player;
    if (!room.game || room.phase !== 'game' || room.game.finished) return null;
    if (room.game.currentPlayerId !== playerId) return null;
    const extraPlayer = room.players.find((item) => item.id === playerId);
    if (!extraPlayer || !this.getProfession(extraPlayer)) return null;
    return extraPlayer;
  }

  async settleSalary(room, playerId, auto = false) {
    const player = this.getActivePlayer(room, playerId);
    const profession = this.getProfession(player);
    if (!player || !profession) return super.settleSalary(room, playerId, auto);

    const { dice, total } = rollDice(room.game.round, room.game.forceDoubleDice);
    const salaryRaiseFactor = 1 + (Math.floor((room.game.round - 1) / 5) * 0.1);
    const effectiveSalary = round2(profession.salary * salaryRaiseFactor);
    const income = Math.round(total * effectiveSalary * 10);
    player.cash += income;
    room.game.lastEvent = {
      type: 'salary', playerId, dice, diceTotal: total, amount: income,
      baseSalary: profession.salary, effectiveSalary, salaryRaiseFactor, auto,
      text: `${player.name}${auto ? ' 逾時自動' : ''}領薪，現金 +${income}`,
    };
    await this.advanceTurn(room);
    return true;
  }

  async settleMarketAction(room, playerId, action) {
    const player = this.getActivePlayer(room, playerId);
    const profession = this.getProfession(player);
    if (!player || !profession) return super.settleMarketAction(room, playerId, action);

    const { dice, total } = rollDice(room.game.round, room.game.forceDoubleDice);
    const event = { type: action, playerId, dice, diceTotal: total };

    if (action === 'buyStock') {
      const salaryIncome = Math.round(total * profession.salary * 7);
      const cost = Math.round(total * room.game.stockPrice);
      const units = round2(total * 3 * profession.stock);
      const availableCash = player.cash + salaryIncome;
      Object.assign(event, { salaryIncome, cost, units, success: availableCash >= cost });
      player.cash = event.success ? availableCash - cost : availableCash;
      if (event.success) player.stocks = round2(player.stocks + units);
      event.text = `${player.name} 買股${event.success ? '成功' : '失敗'}`;
    } else if (action === 'buyLand') {
      const salaryIncome = Math.round(total * profession.salary * 7);
      const cost = Math.round(total * room.game.landPrice);
      const units = round2(total * 3 * profession.land);
      const availableCash = player.cash + salaryIncome;
      Object.assign(event, { salaryIncome, cost, units, success: availableCash >= cost });
      player.cash = event.success ? availableCash - cost : availableCash;
      if (event.success) player.land = round2(player.land + units);
      event.text = `${player.name} 圈地${event.success ? '成功' : '失敗'}`;
    } else if (action === 'sellStock') {
      const salaryIncome = Math.round(total * profession.salary * 5);
      const units = round2(Math.min(total * 5 * profession.stock, player.stocks));
      const proceeds = Math.round(units * room.game.stockPrice);
      player.cash += salaryIncome + proceeds;
      player.stocks = round2(Math.max(0, player.stocks - units));
      Object.assign(event, { salaryIncome, units, proceeds, success: true });
      event.text = `${player.name} 賣股`;
    } else if (action === 'sellLand') {
      const salaryIncome = Math.round(total * profession.salary * 5);
      const units = round2(Math.min(total * 5 * profession.land, player.land));
      const proceeds = Math.round(units * room.game.landPrice);
      player.cash += salaryIncome + proceeds;
      player.land = round2(Math.max(0, player.land - units));
      Object.assign(event, { salaryIncome, units, proceeds, success: true });
      event.text = `${player.name} 賣地`;
    } else {
      return false;
    }

    room.game.lastEvent = event;
    await this.advanceTurn(room);
    return true;
  }

  async settleDream(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    const profession = this.getProfession(player);
    if (!player || !profession) return super.settleDream(room, playerId);

    const { dice, total } = rollDice(room.game.round, room.game.forceDoubleDice);
    const salaryIncome = Math.round(total * profession.salary * 3);
    const fee = Math.round(total * 500);
    const cashAfterSalary = player.cash + salaryIncome;
    const deficit = Math.max(0, fee - cashAfterSalary);
    const happinessGain = round2(total * profession.dream);
    const event = { type: 'dream', playerId, dice, diceTotal: total, salaryIncome, fee, happinessGain };
    const liquidation = deficit > 0 ? this.findDreamLiquidation(player, room.game, deficit) : null;

    if (deficit > 0 && !liquidation) {
      player.cash = cashAfterSalary;
      event.success = false;
      event.text = `${player.name} 圓夢失敗：資金不足，保留30%薪資 +${salaryIncome}`;
    } else {
      const proceeds = liquidation?.proceeds || 0;
      const soldStocks = liquidation?.stocks || 0;
      const soldLand = liquidation?.land || 0;
      player.cash = cashAfterSalary + proceeds - fee;
      player.stocks = round2(Math.max(0, player.stocks - soldStocks));
      player.land = round2(Math.max(0, player.land - soldLand));
      player.happiness = round2(player.happiness + happinessGain);
      event.success = true;
      event.liquidation = { stocks: soldStocks, land: soldLand, proceeds, discount: 0.8 };
      event.text = `${player.name} 圓夢成功`;
    }

    room.game.lastEvent = event;
    await this.advanceTurn(room);
    return true;
  }

  async handleSocketEvent(socket, attachment, message) {
    const event = String(message?.event || '');
    const professionId = String(message?.payload?.profession || '');

    if (event === 'room:chooseProfession' && EXTRA_PROFESSIONS[professionId]) {
      const requestId = message?.requestId || null;
      const room = await this.getRoom();
      const player = this.findPlayer(room, attachment.playerId, attachment.reconnectToken);
      if (!player) {
        this.ack(socket, requestId, { ok: false, message: '玩家驗證失敗，請重新加入。' });
        return;
      }
      if (room.phase !== 'profession') {
        this.ack(socket, requestId, { ok: false, message: '目前還不能選擇職業。' });
        return;
      }
      if (room.players.some((item) => item.id !== player.id && item.profession === professionId)) {
        this.ack(socket, requestId, { ok: false, message: '這個職業已被其他玩家選走。' });
        return;
      }

      player.profession = professionId;
      if (room.players.length >= 2 && room.players.every((item) => Boolean(item.profession))) {
        await this.initializeGame(room);
        this.ack(socket, requestId, { ok: true, room: this.publicRoom(room) });
        return;
      }

      await this.broadcastRoom(room);
      this.ack(socket, requestId, { ok: true, room: this.publicRoom(room) });
      return;
    }

    await super.handleSocketEvent(socket, attachment, message);
  }
}
