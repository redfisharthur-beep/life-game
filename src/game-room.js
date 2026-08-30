const MAX_PLAYERS = 6;
const TOTAL_ROUNDS = 30;
const HAPPINESS_GOAL = 48;
const TURN_MS = 6_000;
const ACTION_SHOWCASE_MS = 8_000;
const ROUND_ACCELERATION_MS = 3_000;
const MAJOR_EVENT_MS = 4_000;
const MAJOR_EVENT_CHANCE = 0.08;
const PROFESSION_AUTO_PICK_MS = 5 * 60_000;

const PROFESSIONS = {
  doctor: { name: '醫師', salary: 7, stock: 1.5, land: 2.0, dream: 2.25 },
  engineer: { name: '資訊工程師', salary: 8, stock: 2.0, land: 1.0, dream: 2.20 },
  sales: { name: '超級業務員', salary: 9, stock: 1.5, land: 1.5, dream: 2.05 },
  office: { name: '白領上班族', salary: 5, stock: 2.0, land: 1.0, dream: 2.60 },
  athlete: { name: '職棒球員', salary: 6, stock: 1.0, land: 1.5, dream: 2.45 },
  rich: { name: '企業富二代', salary: 10, stock: 1.0, land: 2.0, dream: 2.00 },
};

const MAJOR_EVENTS = [
  { id: 'financialCrash', title: '金融海嘯', description: '股市重挫，股票價格立刻 ×0.6' },
  { id: 'earthquake', title: '大地震', description: '地價重挫，土地價格立刻 ×0.6' },
  { id: 'inflation', title: '通貨膨脹', description: '所有玩家現金立刻 ×0.7' },
  { id: 'aiBoom', title: 'AI世代爆發', description: '股票價格立刻 ×1.6' },
  { id: 'urbanRenewal', title: '都市重劃', description: '土地價格立刻 ×1.6' },
  { id: 'eraWave', title: '時代浪潮', description: '從現在開始，後續所有骰子都改為2顆' },
  { id: 'happinessBoost', title: '幸福加倍', description: '所有玩家幸福值立刻 ×1.3' },
  { id: 'cashGrant', title: '普發現金', description: '所有玩家現金 +1000 元' },
];

const AVAILABLE_ACTIONS = new Set([
  'salary', 'buyStock', 'buyLand', 'fate', 'sabotage', 'help', 'sellStock', 'sellLand', 'dream',
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 12);
}

function createToken() {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function roundHalf(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 2) / 2;
}

function shuffle(values) {
  const items = [...values];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function randomChoice(values) {
  return values.length ? values[Math.floor(Math.random() * values.length)] : null;
}

function stageName(round) {
  if (round <= 9) return '人生起步';
  if (round <= 19) return '人生發展';
  return '人生加速';
}

function rollDice(round, forceDoubleDice = false) {
  const diceCount = forceDoubleDice || round >= 16 ? 2 : 1;
  const dice = Array.from({ length: diceCount }, () => 1 + Math.floor(Math.random() * 6));
  return { dice, total: dice.reduce((sum, value) => sum + value, 0) };
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async getRoom(code = '') {
    const saved = await this.state.storage.get('room');
    if (saved) return saved;
    return {
      code: String(code || '').toUpperCase(),
      hostId: null,
      players: [],
      started: false,
      phase: 'lobby',
      professionDeadline: null,
      game: null,
    };
  }

  async saveRoom(room) {
    await this.state.storage.put('room', room);
  }

  playerAssets(player, game) {
    return round2(
      Number(player.cash || 0)
      + (Number(player.stocks || 0) * Number(game?.stockPrice || 0))
      + (Number(player.land || 0) * Number(game?.landPrice || 0))
    );
  }

  calculateResults(room) {
    const scores = room.players.map((player) => ({
      playerId: player.id,
      name: player.name,
      profession: player.profession,
      happiness: round2(player.happiness || 0),
      totalAssets: this.playerAssets(player, room.game),
      helpCount: Number(player.helpCount || 0),
      sabotageCount: Number(player.sabotageCount || 0),
      stocks: round2(player.stocks || 0),
      land: round2(player.land || 0),
      cash: Math.round(player.cash || 0),
    }));

    const sorted = [...scores].sort((a, b) => (
      (b.happiness - a.happiness)
      || (b.totalAssets - a.totalAssets)
      || (b.helpCount - a.helpCount)
      || a.name.localeCompare(b.name, 'zh-Hant')
    ));

    let currentRank = 1;
    const rankings = sorted.map((entry, index) => {
      if (index > 0) {
        const previous = sorted[index - 1];
        if (entry.happiness !== previous.happiness
          || entry.totalAssets !== previous.totalAssets
          || entry.helpCount !== previous.helpCount) currentRank = index + 1;
      }
      return { ...entry, rank: currentRank, titles: [] };
    });

    const titleRules = [
      ['幸福王', 'happiness'], ['財富王', 'totalAssets'], ['股神', 'stocks'],
      ['地產王', 'land'], ['暖心王', 'helpCount'], ['搞事王', 'sabotageCount'],
    ];
    titleRules.forEach(([title, key]) => {
      const max = Math.max(...scores.map((entry) => Number(entry[key] || 0)));
      rankings.forEach((entry) => {
        if (Number(entry[key] || 0) === max) entry.titles.push(title);
      });
    });

    return {
      rankings,
      winnerIds: rankings.filter((entry) => entry.rank === 1).map((entry) => entry.playerId),
    };
  }

  publicRoom(room) {
    const allReady = room.started
      && room.players.length >= 2
      && room.players.every((player) => Boolean(player.profession));
    const game = room.game ? {
      round: room.game.round,
      totalRounds: TOTAL_ROUNDS,
      stageName: stageName(room.game.round),
      stockPrice: room.game.stockPrice,
      landPrice: room.game.landPrice,
      turnOrder: [...room.game.turnOrder],
      turnIndex: room.game.turnIndex,
      currentPlayerId: room.game.currentPlayerId,
      turnId: room.game.turnId,
      deadline: room.game.deadline,
      showcaseUntil: room.game.showcaseUntil || null,
      transitionUntil: room.game.transitionUntil || null,
      majorEvent: room.game.majorEvent || null,
      majorEventUntil: room.game.majorEventUntil || null,
      forceDoubleDice: Boolean(room.game.forceDoubleDice),
      roundAnnouncement: null,
      lastEvent: room.game.lastEvent,
      results: room.game.results || null,
      finished: Boolean(room.game.finished),
    } : null;

    return {
      code: room.code,
      hostId: room.hostId,
      serverTime: Date.now(),
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        profession: player.profession || null,
        connected: Boolean(player.connected),
        cash: Number(player.cash || 0),
        stocks: Number(player.stocks || 0),
        land: Number(player.land || 0),
        happiness: Number(player.happiness || 0),
        helpCount: Number(player.helpCount || 0),
        sabotageCount: Number(player.sabotageCount || 0),
        totalAssets: room.game ? this.playerAssets(player, room.game) : 0,
      })),
      maxPlayers: MAX_PLAYERS,
      started: Boolean(room.started),
      phase: room.phase || (room.started ? 'profession' : 'lobby'),
      allReady,
      game,
    };
  }

  sessionPayload(room, player) {
    return {
      roomCode: room.code,
      playerId: player.id,
      reconnectToken: player.reconnectToken,
      name: player.name,
    };
  }

  findPlayer(room, playerId, reconnectToken) {
    return room.players.find((player) => (
      player.id === String(playerId || '')
      && player.reconnectToken === String(reconnectToken || '')
    ));
  }

  send(socket, message) {
    try { socket.send(JSON.stringify(message)); } catch (_) {}
  }

  broadcast(event, data) {
    const message = { type: 'event', event, data };
    this.state.getWebSockets().forEach((socket) => this.send(socket, message));
  }

  ack(socket, requestId, result) {
    if (requestId) this.send(socket, { type: 'ack', requestId, result });
  }

  async broadcastRoom(room, event = 'room:update') {
    await this.saveRoom(room);
    this.broadcast(event, this.publicRoom(room));
  }

  async syncMatchmaker(room) {
    try {
      const id = this.env.MATCHMAKER.idFromName('global');
      const stub = this.env.MATCHMAKER.get(id);
      await stub.fetch('https://matchmaker.internal/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: room.code, count: room.players.length, started: Boolean(room.started) }),
      });
    } catch (error) {
      console.error('Matchmaker sync failed', error);
    }
  }

  async scheduleAt(timestamp) {
    if (timestamp) await this.state.storage.setAlarm(Math.max(Date.now() + 1, timestamp));
  }

  async join(name, code, skipSync = false) {
    const clean = cleanName(name);
    if (!clean) return { ok: false, message: '請輸入暱稱' };
    const room = await this.getRoom(code);
    if (!room.code) room.code = String(code || '').toUpperCase();
    if (room.started) return { ok: false, reason: 'started', message: '這個房間已經開始遊戲。' };
    if (room.players.length >= MAX_PLAYERS) return { ok: false, reason: 'full', message: '這個房間已滿。' };
    if (room.players.some((player) => player.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, reason: 'nameTaken', message: '這個暱稱在房間內已有人使用。' };
    }

    const player = {
      id: crypto.randomUUID(), reconnectToken: createToken(), connected: false, name: clean,
      profession: null, cash: 0, stocks: 0, land: 0, happiness: 0, helpCount: 0, sabotageCount: 0,
    };
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    await this.saveRoom(room);
    if (!skipSync) await this.syncMatchmaker(room);
    return { ok: true, room: this.publicRoom(room), session: this.sessionPayload(room, player) };
  }

  async initializeGame(room) {
    room.professionDeadline = null;
    room.phase = 'game';
    room.players.forEach((player) => {
      player.cash = 0; player.stocks = 0; player.land = 0; player.happiness = 0;
      player.helpCount = 0; player.sabotageCount = 0;
    });
    room.game = {
      round: 1,
      stockPrice: 10,
      landPrice: 10,
      turnOrder: shuffle(room.players.map((player) => player.id)),
      turnIndex: 0,
      currentPlayerId: null,
      turnId: null,
      turnProcessed: false,
      deadline: null,
      showcaseUntil: null,
      transitionUntil: null,
      majorEvent: null,
      majorEventUntil: null,
      triggeredMajorEvents: [],
      forceDoubleDice: false,
      lastEvent: { type: 'start', text: '職業選擇完成，人生啟程！' },
      results: null,
      finished: false,
    };
    await this.beginTurn(room);
  }

  getActivePlayer(room, playerId) {
    if (!room.game || room.phase !== 'game' || room.game.finished) return null;
    if (room.game.currentPlayerId !== playerId) return null;
    const player = room.players.find((item) => item.id === playerId);
    if (!player || !player.profession || !PROFESSIONS[player.profession]) return null;
    return player;
  }

  claimTurn(room, playerId, turnId) {
    if (!room?.game || room.phase !== 'game' || room.game.finished) return false;
    if (room.game.currentPlayerId !== playerId || !turnId || room.game.turnId !== turnId || room.game.turnProcessed) return false;
    room.game.turnProcessed = true;
    return true;
  }

  async beginTurn(room) {
    if (room.phase !== 'game' || !room.game || room.game.finished) return;
    room.game.showcaseUntil = null;
    room.game.transitionUntil = null;
    room.game.majorEvent = null;
    room.game.majorEventUntil = null;

    while (room.game.turnIndex < room.game.turnOrder.length) {
      const id = room.game.turnOrder[room.game.turnIndex];
      if (room.players.some((player) => player.id === id)) break;
      room.game.turnIndex += 1;
    }
    if (room.game.turnIndex >= room.game.turnOrder.length) {
      await this.endRound(room);
      return;
    }

    room.game.currentPlayerId = room.game.turnOrder[room.game.turnIndex];
    room.game.turnId = crypto.randomUUID();
    room.game.turnProcessed = false;
    room.game.deadline = Date.now() + TURN_MS;
    await this.broadcastRoom(room);
    await this.scheduleAt(room.game.deadline + 50);
  }

  hasReachedHappinessGoal(room) {
    return room.players.some((player) => Number(player.happiness || 0) >= HAPPINESS_GOAL);
  }

  async advanceTurn(room) {
    room.game.deadline = null;
    room.game.showcaseUntil = Date.now() + ACTION_SHOWCASE_MS;
    await this.broadcastRoom(room);
    await this.scheduleAt(room.game.showcaseUntil);
  }

  updateMarket(room) {
    const stockUp = Math.random() < 0.60;
    const landUp = Math.random() < 0.80;
    room.game.stockPrice = round2(room.game.stockPrice * (stockUp ? 1.12 : 0.92));
    room.game.landPrice = round2(room.game.landPrice * (landUp ? 1.04 : 0.96));
    return `${stockUp ? '股票上漲 12%' : '股票下跌 8%'}，${landUp ? '土地上漲 4%' : '土地下跌 4%'}`;
  }

  applyMajorEvent(room, event) {
    if (event.id === 'financialCrash') room.game.stockPrice = round2(room.game.stockPrice * 0.6);
    else if (event.id === 'earthquake') room.game.landPrice = round2(room.game.landPrice * 0.6);
    else if (event.id === 'inflation') room.players.forEach((p) => { p.cash = Math.round(Number(p.cash || 0) * 0.7); });
    else if (event.id === 'aiBoom') room.game.stockPrice = round2(room.game.stockPrice * 1.6);
    else if (event.id === 'urbanRenewal') room.game.landPrice = round2(room.game.landPrice * 1.6);
    else if (event.id === 'eraWave') room.game.forceDoubleDice = true;
    else if (event.id === 'happinessBoost') room.players.forEach((p) => { p.happiness = round2(Number(p.happiness || 0) * 1.3); });
    else if (event.id === 'cashGrant') room.players.forEach((p) => { p.cash = Math.round(Number(p.cash || 0)) + 1000; });
  }

  tryTriggerMajorEvent(room) {
    const used = new Set(room.game.triggeredMajorEvents || []);
    const available = MAJOR_EVENTS.filter((event) => !used.has(event.id));
    if (!available.length || Math.random() >= MAJOR_EVENT_CHANCE) return null;
    const event = randomChoice(available);
    this.applyMajorEvent(room, event);
    room.game.triggeredMajorEvents.push(event.id);
    room.game.majorEvent = { id: event.id, title: event.title, description: event.description, round: room.game.round };
    room.game.majorEventUntil = Date.now() + MAJOR_EVENT_MS;
    room.game.lastEvent = { type: 'majorEvent', eventId: event.id, text: `重大事件：${event.title}｜${event.description}` };
    return room.game.majorEvent;
  }

  async finishGame(room, reason = 'rounds') {
    room.game.finished = true;
    room.game.currentPlayerId = null;
    room.game.turnId = null;
    room.game.turnProcessed = true;
    room.game.deadline = null;
    room.game.showcaseUntil = null;
    room.game.transitionUntil = null;
    room.game.majorEvent = null;
    room.game.majorEventUntil = null;
    room.game.results = this.calculateResults(room);
    room.game.lastEvent = {
      type: 'finish',
      text: reason === 'happiness'
        ? `有玩家達成 ${HAPPINESS_GOAL} 幸福值，人生旅程提前完成！`
        : '50歲人生旅程完成！',
    };
    room.phase = 'finished';
    await this.broadcastRoom(room);
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

    if (room.game.round === 16 && !room.game.forceDoubleDice) {
      room.game.transitionUntil = Date.now() + ROUND_ACCELERATION_MS;
      await this.broadcastRoom(room);
      await this.scheduleAt(room.game.transitionUntil);
      return;
    }
    await this.beginTurn(room);
  }

  async endRound(room) {
    const completedRound = room.game.round;
    const marketText = completedRound < TOTAL_ROUNDS ? this.updateMarket(room) : null;
    const majorEvent = this.tryTriggerMajorEvent(room);
    room.game.currentPlayerId = null;
    room.game.deadline = null;
    room.game.showcaseUntil = null;
    room.game.turnProcessed = true;

    if (majorEvent) {
      room.game.pendingMarketText = marketText;
      await this.broadcastRoom(room);
      await this.scheduleAt(room.game.majorEventUntil);
      return;
    }
    await this.continueAfterRound(room, completedRound, marketText);
  }

  async settleSalary(room, playerId, auto = false) {
    const player = this.getActivePlayer(room, playerId);
    if (!player) return false;
    const { dice, total } = rollDice(room.game.round, room.game.forceDoubleDice);
    const salary = PROFESSIONS[player.profession].salary;
    const salaryRaiseFactor = 1 + (Math.floor((room.game.round - 1) / 5) * 0.1);
    const effectiveSalary = round2(salary * salaryRaiseFactor);
    const income = Math.round(total * effectiveSalary * 10);
    player.cash += income;
    room.game.lastEvent = {
      type: 'salary', playerId, dice, diceTotal: total, amount: income,
      baseSalary: salary, effectiveSalary, salaryRaiseFactor, auto,
      text: `${player.name}${auto ? ' 逾時自動' : ''}領薪，現金 +${income}`,
    };
    await this.advanceTurn(room);
    return true;
  }

  async settleMarketAction(room, playerId, action) {
    const player = this.getActivePlayer(room, playerId);
    if (!player) return false;
    const profession = PROFESSIONS[player.profession];
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
    } else return false;

    room.game.lastEvent = event;
    await this.advanceTurn(room);
    return true;
  }

  async settleFate(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    if (!player) return false;
    const { dice, total } = rollDice(room.game.round, room.game.forceDoubleDice);
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

  chooseSabotageTarget(room, actorId) {
    const others = room.players.filter((player) => player.id !== actorId);
    if (!others.length) return null;
    const highestHappiness = Math.max(...others.map((player) => Number(player.happiness || 0)));
    const happiest = others.filter((player) => Number(player.happiness || 0) === highestHappiness);
    const highestAssets = Math.max(...happiest.map((player) => this.playerAssets(player, room.game)));
    return randomChoice(happiest.filter((player) => this.playerAssets(player, room.game) === highestAssets));
  }

  async settleSabotage(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    const target = this.chooseSabotageTarget(room, playerId);
    if (!player || !target) return false;
    const { dice, total } = rollDice(room.game.round, room.game.forceDoubleDice);
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

  getHelpCandidates(room, actorId) {
    const others = room.players.filter((player) => player.id !== actorId);
    if (!others.length) return [];
    const lowestHappiness = Math.min(...others.map((player) => Number(player.happiness || 0)));
    const leastHappy = others.filter((player) => Number(player.happiness || 0) === lowestHappiness);
    const lowestAssets = Math.min(...leastHappy.map((player) => this.playerAssets(player, room.game)));
    return leastHappy.filter((player) => this.playerAssets(player, room.game) === lowestAssets);
  }

  async settleHelp(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    const target = randomChoice(this.getHelpCandidates(room, playerId));
    if (!player || !target) return false;
    const { dice, total } = rollDice(room.game.round, room.game.forceDoubleDice);
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

  findDreamLiquidation(player, game, deficit) {
    if (deficit <= 0) return { stocks: 0, land: 0, proceeds: 0, marketValueMetric: 0, surplus: 0 };
    const maxStockSteps = Math.floor(round2(player.stocks) * 2 + 1e-9);
    const maxLandSteps = Math.floor(round2(player.land) * 2 + 1e-9);
    const stockPriceCents = Math.round(game.stockPrice * 100);
    const landPriceCents = Math.round(game.landPrice * 100);
    let best = null;
    for (let stockSteps = 0; stockSteps <= maxStockSteps; stockSteps += 1) {
      for (let landSteps = 0; landSteps <= maxLandSteps; landSteps += 1) {
        if (!stockSteps && !landSteps) continue;
        const marketValueMetric = stockSteps * stockPriceCents + landSteps * landPriceCents;
        const proceeds = Math.round((marketValueMetric / 200) * 0.8);
        if (proceeds < deficit) continue;
        const candidate = {
          stocks: stockSteps / 2, land: landSteps / 2, proceeds,
          marketValueMetric, surplus: proceeds - deficit, stockSteps,
        };
        if (!best
          || candidate.marketValueMetric < best.marketValueMetric
          || (candidate.marketValueMetric === best.marketValueMetric && candidate.surplus < best.surplus)
          || (candidate.marketValueMetric === best.marketValueMetric && candidate.surplus === best.surplus && candidate.stockSteps > best.stockSteps)) best = candidate;
      }
    }
    return best;
  }

  async settleDream(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    if (!player) return false;
    const profession = PROFESSIONS[player.profession];
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

  async handleGameAction(room, player, payload) {
    const action = String(payload?.action || '');
    const turnId = String(payload?.turnId || '');
    if (!room.game || room.phase !== 'game' || room.game.finished) return { ok: false, message: '目前不在遊戲回合中。' };
    if (room.game.currentPlayerId !== player.id) return { ok: false, message: '還沒輪到你。' };
    if (room.game.turnId !== turnId || room.game.turnProcessed) return { ok: false, message: '這個回合已經結算。' };
    if (Date.now() >= Number(room.game.deadline || 0)) {
      if (this.claimTurn(room, player.id, turnId)) await this.settleSalary(room, player.id, true);
      return { ok: false, message: '本回合時間已到，已自動領薪。', room: this.publicRoom(room) };
    }
    if (!AVAILABLE_ACTIONS.has(action)) return { ok: false, message: '這個行動尚未開放。' };
    if (action === 'sabotage' && room.players.length < 2) return { ok: false, message: '目前沒有可以陷害的玩家。' };
    if (action === 'help' && this.getHelpCandidates(room, player.id).length === 0) return { ok: false, message: '目前沒有可以援助的玩家。' };
    if (!this.claimTurn(room, player.id, turnId)) return { ok: false, message: '這個回合已經結算。' };

    let settled = false;
    if (action === 'salary') settled = await this.settleSalary(room, player.id, false);
    else if (['buyStock', 'buyLand', 'sellStock', 'sellLand'].includes(action)) settled = await this.settleMarketAction(room, player.id, action);
    else if (action === 'fate') settled = await this.settleFate(room, player.id);
    else if (action === 'sabotage') settled = await this.settleSabotage(room, player.id);
    else if (action === 'help') settled = await this.settleHelp(room, player.id);
    else if (action === 'dream') settled = await this.settleDream(room, player.id);
    if (!settled) {
      room.game.turnProcessed = false;
      await this.saveRoom(room);
      return { ok: false, message: '目前無法完成這個行動。' };
    }
    return { ok: true, room: this.publicRoom(room) };
  }

  async removePlayer(room, playerId) {
    const wasCurrent = room.game?.currentPlayerId === playerId;
    room.players = room.players.filter((item) => item.id !== playerId);
    if (room.hostId === playerId) room.hostId = room.players[0]?.id || null;
    if (!room.players.length) {
      room.started = false; room.phase = 'lobby'; room.professionDeadline = null; room.game = null;
      await this.saveRoom(room); await this.syncMatchmaker(room); return;
    }
    if (room.phase === 'game' && room.game && wasCurrent) {
      room.game.turnProcessed = true; room.game.deadline = null; room.game.showcaseUntil = null; room.game.turnIndex += 1;
      await this.beginTurn(room); return;
    }
    if (room.phase === 'profession' && room.players.length >= 2 && room.players.every((item) => Boolean(item.profession))) {
      await this.initializeGame(room); return;
    }
    if (room.phase === 'finished' && room.game) room.game.results = this.calculateResults(room);
    await this.broadcastRoom(room);
    await this.syncMatchmaker(room);
  }

  async handleSocketEvent(socket, attachment, message) {
    const event = String(message?.event || '');
    const payload = message?.payload || {};
    const requestId = message?.requestId || null;
    const room = await this.getRoom();
    const player = this.findPlayer(room, attachment.playerId, attachment.reconnectToken);
    if (!player) {
      this.ack(socket, requestId, { ok: false, message: '玩家驗證失敗，請重新加入。' });
      return;
    }

    if (event === 'room:resume') {
      player.connected = true;
      await this.saveRoom(room);
      const snapshot = this.publicRoom(room);
      this.ack(socket, requestId, { ok: true, room: snapshot, session: this.sessionPayload(room, player) });
      this.broadcast('room:update', snapshot);
      return;
    }

    if (event === 'room:start') {
      if (room.hostId !== player.id) return this.ack(socket, requestId, { ok: false, message: '只有房主可以啟程。' });
      if (room.started) return this.ack(socket, requestId, { ok: true, room: this.publicRoom(room) });
      if (room.players.length < 2) return this.ack(socket, requestId, { ok: false, message: '至少需要2位玩家才能啟程。' });
      room.started = true;
      room.phase = 'profession';
      room.professionDeadline = Date.now() + PROFESSION_AUTO_PICK_MS;
      room.players.forEach((item) => { item.profession = null; });
      await this.saveRoom(room);
      await this.syncMatchmaker(room);
      await this.scheduleAt(room.professionDeadline);
      const snapshot = this.publicRoom(room);
      this.ack(socket, requestId, { ok: true, room: snapshot });
      this.broadcast('room:started', snapshot);
      this.broadcast('room:update', snapshot);
      return;
    }

    if (event === 'room:chooseProfession') {
      const professionId = String(payload?.profession || '');
      if (room.phase !== 'profession') return this.ack(socket, requestId, { ok: false, message: '目前還不能選擇職業。' });
      if (!PROFESSIONS[professionId]) return this.ack(socket, requestId, { ok: false, message: '這個職業不存在。' });
      if (room.players.some((item) => item.id !== player.id && item.profession === professionId)) {
        return this.ack(socket, requestId, { ok: false, message: '這個職業已被其他玩家選走。' });
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

    if (event === 'game:action') {
      const result = await this.handleGameAction(room, player, payload);
      this.ack(socket, requestId, result);
      return;
    }

    if (event === 'game:restart') {
      if (room.phase !== 'finished') return this.ack(socket, requestId, { ok: false, message: '目前無法重新開始。' });
      if (room.hostId !== player.id) return this.ack(socket, requestId, { ok: false, message: '只有房主可以開啟下一局。' });
      const online = room.players.filter((item) => item.connected);
      if (online.length < 2) return this.ack(socket, requestId, { ok: false, message: '至少需要2位在線玩家才能再來一局。' });
      room.players = online;
      if (!room.players.some((item) => item.id === room.hostId)) room.hostId = room.players[0].id;
      room.started = true; room.phase = 'profession'; room.game = null;
      room.professionDeadline = Date.now() + PROFESSION_AUTO_PICK_MS;
      room.players.forEach((item) => {
        item.profession = null; item.cash = 0; item.stocks = 0; item.land = 0; item.happiness = 0;
        item.helpCount = 0; item.sabotageCount = 0;
      });
      await this.saveRoom(room); await this.scheduleAt(room.professionDeadline);
      const snapshot = this.publicRoom(room);
      this.ack(socket, requestId, { ok: true, room: snapshot });
      this.broadcast('room:started', snapshot); this.broadcast('room:update', snapshot);
      return;
    }

    if (event === 'room:leave') {
      this.ack(socket, requestId, { ok: true });
      await this.removePlayer(room, player.id);
      try { socket.close(1000, 'left room'); } catch (_) {}
      return;
    }

    this.ack(socket, requestId, { ok: false, message: '未知的房間事件。' });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      const code = url.searchParams.get('code') || 'UNKNOWN';
      const room = await this.getRoom(code);
      return json({ ok: true, durableObject: 'GameRoom', room: code, players: room.players.length, phase: room.phase });
    }
    if (url.pathname === '/internal/join' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      return json(await this.join(payload.name, payload.code, Boolean(payload.skipSync)));
    }
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket upgrade', { status: 426 });
      const room = await this.getRoom();
      const player = this.findPlayer(room, url.searchParams.get('playerId'), url.searchParams.get('reconnectToken'));
      if (!player) return new Response('Unauthorized player', { status: 401 });
      const pair = new WebSocketPair();
      const client = pair[0]; const server = pair[1];
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ playerId: player.id, reconnectToken: player.reconnectToken });
      player.connected = true;
      await this.saveRoom(room);
      const snapshot = this.publicRoom(room);
      this.broadcast('room:update', snapshot);
      this.send(server, { type: 'event', event: 'server:ready', data: { message: 'Cloudflare 房間連線成功', playerId: player.id } });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('GameRoom is ready', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  async alarm() {
    const room = await this.getRoom();
    const now = Date.now();

    if (room.phase === 'profession' && room.professionDeadline && now >= room.professionDeadline) {
      const used = new Set(room.players.map((player) => player.profession).filter(Boolean));
      const available = shuffle(Object.keys(PROFESSIONS).filter((id) => !used.has(id)));
      const waiting = shuffle(room.players.filter((player) => !player.profession));
      waiting.forEach((player) => { const id = available.shift(); if (id) player.profession = id; });
      room.professionDeadline = null;
      if (room.players.length >= 2 && room.players.every((player) => Boolean(player.profession))) await this.initializeGame(room);
      else await this.broadcastRoom(room);
      return;
    }

    if (room.phase !== 'game' || !room.game || room.game.finished) return;

    if (room.game.majorEventUntil && now >= room.game.majorEventUntil) {
      const completedRound = room.game.round;
      const marketText = room.game.pendingMarketText || null;
      room.game.pendingMarketText = null;
      await this.continueAfterRound(room, completedRound, marketText);
      return;
    }

    if (room.game.transitionUntil && now >= room.game.transitionUntil) {
      room.game.transitionUntil = null;
      await this.beginTurn(room);
      return;
    }

    if (room.game.showcaseUntil && now >= room.game.showcaseUntil) {
      room.game.showcaseUntil = null;
      if (this.hasReachedHappinessGoal(room)) {
        await this.finishGame(room, 'happiness');
        return;
      }
      room.game.turnIndex += 1;
      await this.beginTurn(room);
      return;
    }

    if (room.game.deadline && now >= room.game.deadline) {
      const playerId = room.game.currentPlayerId;
      const turnId = room.game.turnId;
      if (this.claimTurn(room, playerId, turnId)) await this.settleSalary(room, playerId, true);
      return;
    }
  }

  async webSocketMessage(socket, rawMessage) {
    let message;
    try { message = JSON.parse(typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage)); } catch (_) { return; }
    await this.handleSocketEvent(socket, socket.deserializeAttachment() || {}, message);
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
    await this.saveRoom(room);
    this.broadcast('room:update', this.publicRoom(room));
  }

  async webSocketError(socket) {
    await this.webSocketClose(socket);
  }
}
