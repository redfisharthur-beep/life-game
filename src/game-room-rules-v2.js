import { GameRoom as EightProfessionGameRoom } from './game-room-eight.js';

const TOTAL_ROUNDS = 30;
const ROUND_TRANSITION_MS = 3_000;

const PROFESSIONS = {
  doctor: { name: '醫師', salary: 7, stock: 1.5, land: 2.0, dream: 2.25 },
  engineer: { name: '資訊工程師', salary: 8, stock: 2.0, land: 1.0, dream: 2.20 },
  sales: { name: '超級業務員', salary: 9, stock: 1.5, land: 1.5, dream: 2.05 },
  office: { name: '白領上班族', salary: 5, stock: 2.0, land: 1.0, dream: 2.60 },
  athlete: { name: '職棒球員', salary: 6, stock: 1.0, land: 1.5, dream: 2.45 },
  rich: { name: '企業富二代', salary: 10, stock: 1.0, land: 2.0, dream: 2.00 },
  civilServant: { name: '公務員', salary: 6.5, stock: 1.5, land: 1.5, dream: 2.35 },
  artist: { name: '藝人', salary: 8, stock: 1.25, land: 0.75, dream: 2.55 },
};

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function roundHalf(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 2) / 2;
}

function randomChoice(values) {
  return values.length ? values[Math.floor(Math.random() * values.length)] : null;
}

function shuffle(values) {
  const items = [...values];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function rollDice(round) {
  const normalizedRound = Math.max(1, Math.min(TOTAL_ROUNDS, Number(round || 1)));
  const diceCount = normalizedRound <= 10 ? 1 : normalizedRound <= 20 ? 2 : 3;
  const dice = Array.from({ length: diceCount }, () => 1 + Math.floor(Math.random() * 6));
  return { dice, total: dice.reduce((sum, value) => sum + value, 0) };
}

export class GameRoom extends EightProfessionGameRoom {
  professionFor(player) {
    return PROFESSIONS[player?.profession] || null;
  }

  async continueAfterRound(room, completedRound, marketText) {
    room.game.majorEvent = null;
    room.game.majorEventUntil = null;
    if (completedRound >= TOTAL_ROUNDS) {
      await this.finishGame(room, 'rounds');
      return;
    }

    room.game.round += 1;
    room.game.turnOrder = shuffle(room.players.map((player) => player.id));
    room.game.turnIndex = 0;
    room.game.currentPlayerId = null;
    room.game.turnId = null;
    room.game.turnProcessed = false;
    room.game.deadline = null;
    room.game.showcaseUntil = null;
    room.game.transitionUntil = null;
    room.game.lastEvent = { type: 'market', text: marketText };

    if (room.game.round === 11 || room.game.round === 21) {
      room.game.transitionUntil = Date.now() + ROUND_TRANSITION_MS;
      await this.broadcastRoom(room);
      await this.scheduleAt(room.game.transitionUntil);
      return;
    }

    await this.beginTurn(room);
  }

  async settleSalary(room, playerId, auto = false) {
    const player = this.getActivePlayer(room, playerId);
    const profession = this.professionFor(player);
    if (!player || !profession) return false;
    const { dice, total } = rollDice(room.game.round);
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
    const profession = this.professionFor(player);
    if (!player || !profession) return false;
    const { dice, total } = rollDice(room.game.round);
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
    } else return false;

    room.game.lastEvent = event;
    await this.advanceTurn(room);
    return true;
  }

  async settleFate(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    if (!player) return false;
    const { dice, total } = rollDice(room.game.round);
    const fateIndex = Math.floor(Math.random() * 9);
    const event = { type: 'fate', playerId, dice, diceTotal: total, fateIndex };
    const positiveFactor = 1 + (0.1 * total);
    const assetNegativeFactor = Math.max(0, 1 - (0.05 * total));
    const happinessNegativeFactor = Math.max(0, 1 - (0.05 * total));

    if (fateIndex === 0) {
      const before = Math.round(player.cash || 0); const after = Math.round(before * positiveFactor);
      player.cash = after; Object.assign(event, { amount: after - before, before, after, factor: positiveFactor });
      event.text = `${player.name} 現金 +${after - before}`;
    } else if (fateIndex === 1) {
      const before = Math.round(player.cash || 0); const after = Math.max(0, Math.round(before * assetNegativeFactor));
      player.cash = after; Object.assign(event, { amount: after - before, before, after, factor: assetNegativeFactor });
      event.text = `${player.name} 現金 ${after - before}`;
    } else if (fateIndex === 2) {
      const before = roundHalf(player.stocks || 0); const after = roundHalf(before * positiveFactor);
      player.stocks = after; Object.assign(event, { units: roundHalf(after - before), before, after, factor: positiveFactor });
      event.text = `${player.name} 股票 +${roundHalf(after - before)}`;
    } else if (fateIndex === 3) {
      const before = roundHalf(player.stocks || 0); const after = Math.max(0, roundHalf(before * assetNegativeFactor));
      player.stocks = after; Object.assign(event, { units: roundHalf(after - before), before, after, factor: assetNegativeFactor });
      event.text = `${player.name} 股票 ${roundHalf(after - before)}`;
    } else if (fateIndex === 4) {
      const before = roundHalf(player.land || 0); const after = roundHalf(before * positiveFactor);
      player.land = after; Object.assign(event, { units: roundHalf(after - before), before, after, factor: positiveFactor });
      event.text = `${player.name} 土地 +${roundHalf(after - before)}`;
    } else if (fateIndex === 5) {
      const before = roundHalf(player.land || 0); const after = Math.max(0, roundHalf(before * assetNegativeFactor));
      player.land = after; Object.assign(event, { units: roundHalf(after - before), before, after, factor: assetNegativeFactor });
      event.text = `${player.name} 土地 ${roundHalf(after - before)}`;
    } else if (fateIndex === 6) {
      let received = 0; const payments = [];
      room.players.forEach((other) => {
        if (other.id === playerId) return;
        const before = Math.round(other.cash || 0);
        const paid = Math.min(before, Math.round(before * 0.02 * total));
        other.cash = before - paid; received += paid; payments.push({ playerId: other.id, amount: paid });
      });
      player.cash = Math.round(player.cash || 0) + received;
      Object.assign(event, { received, payments, rate: 0.02 * total });
      event.text = `${player.name} 社福救濟收入 +${received}`;
    } else if (fateIndex === 7) {
      const before = round2(player.happiness || 0);
      const after = before > 0 ? round2(before * positiveFactor) : before;
      player.happiness = after;
      Object.assign(event, { happinessChange: round2(after - before), before, after, factor: before > 0 ? positiveFactor : null });
      event.text = `${player.name} 幸福 +${round2(after - before)}`;
    } else {
      const before = round2(player.happiness || 0);
      const after = before > 0 ? round2(before * happinessNegativeFactor) : before;
      player.happiness = after;
      Object.assign(event, { happinessChange: round2(after - before), before, after, factor: before > 0 ? happinessNegativeFactor : null });
      event.text = `${player.name} 幸福 ${round2(after - before)}`;
    }

    room.game.lastEvent = event;
    await this.advanceTurn(room);
    return true;
  }

  async settleSabotage(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    const target = this.chooseSabotageTarget(room, playerId);
    if (!player || !target) return false;
    const { dice, total } = rollDice(room.game.round);
    const effectIndex = Math.floor(Math.random() * 4);
    const factor = Math.max(0, 1 - (0.05 * total));
    let targetChange = 0; let effectText = '';

    if (effectIndex === 0) {
      const before = Math.round(target.cash || 0); const after = Math.max(0, Math.round(before * factor));
      target.cash = after; targetChange = after - before; effectText = `${target.name} 現金 ${targetChange}`;
    } else if (effectIndex === 1) {
      const before = roundHalf(target.stocks || 0); const after = Math.max(0, roundHalf(before * factor));
      target.stocks = after; targetChange = roundHalf(after - before); effectText = `${target.name} 股票 ${targetChange}`;
    } else if (effectIndex === 2) {
      const before = roundHalf(target.land || 0); const after = Math.max(0, roundHalf(before * factor));
      target.land = after; targetChange = roundHalf(after - before); effectText = `${target.name} 土地 ${targetChange}`;
    } else {
      const before = round2(target.happiness || 0); const after = before > 0 ? round2(before * factor) : before;
      target.happiness = after; targetChange = round2(after - before); effectText = `${target.name} 幸福 ${targetChange}`;
    }

    const actorCashBefore = Math.round(player.cash || 0);
    const actorCashAfter = Math.round(actorCashBefore * (1 + (0.02 * total)));
    const bonus = actorCashAfter - actorCashBefore;
    player.cash = actorCashAfter;
    player.sabotageCount = Number(player.sabotageCount || 0) + 1;
    room.game.lastEvent = {
      type: 'sabotage', playerId, targetId: target.id, dice, diceTotal: total,
      effectIndex, targetChange, bonus, factor,
      text: `${player.name} 陷害 ${target.name}：${effectText}；自己現金 +${bonus}`,
    };
    await this.advanceTurn(room);
    return true;
  }

  async settleHelp(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    const target = randomChoice(this.getHelpCandidates(room, playerId));
    if (!player || !target) return false;
    const { dice, total } = rollDice(room.game.round);
    const effectIndex = Math.floor(Math.random() * 4);
    const factor = 1 + (0.05 * total);
    let targetChange = 0; let effectText = '';

    if (effectIndex === 0) {
      const before = Math.round(target.cash || 0); const after = Math.round(before * factor);
      target.cash = after; targetChange = after - before; effectText = `${target.name} 現金 +${targetChange}`;
    } else if (effectIndex === 1) {
      const before = roundHalf(target.stocks || 0); const after = roundHalf(before * factor);
      target.stocks = after; targetChange = roundHalf(after - before); effectText = `${target.name} 股票 +${targetChange}`;
    } else if (effectIndex === 2) {
      const before = roundHalf(target.land || 0); const after = roundHalf(before * factor);
      target.land = after; targetChange = roundHalf(after - before); effectText = `${target.name} 土地 +${targetChange}`;
    } else {
      const before = round2(target.happiness || 0); const after = before > 0 ? round2(before * factor) : before;
      target.happiness = after; targetChange = round2(after - before); effectText = `${target.name} 幸福 +${targetChange}`;
    }

    const actorCashBefore = Math.round(player.cash || 0);
    const actorCashAfter = Math.round(actorCashBefore * (1 + (0.03 * total)));
    const bonus = actorCashAfter - actorCashBefore;
    player.cash = actorCashAfter;
    player.happiness = round2(Number(player.happiness || 0) + 0.7);
    player.helpCount = Number(player.helpCount || 0) + 1;
    room.game.lastEvent = {
      type: 'help', playerId, targetId: target.id, dice, diceTotal: total,
      effectIndex, targetChange, bonus, factor,
      text: `${player.name} 援助 ${target.name}：${effectText}；自己現金 +${bonus}`,
    };
    await this.advanceTurn(room);
    return true;
  }

  async settleDream(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    const profession = this.professionFor(player);
    if (!player || !profession) return false;
    const { dice, total } = rollDice(room.game.round);
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
}
