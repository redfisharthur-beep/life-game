const path = require('path');
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

const rooms = new Map();
const TURN_MS = 10_000;
const TOTAL_ROUNDS = 30;

const PROFESSIONS = {
  doctor: { name: '醫師', salary: 7, stock: 1.5, land: 2.0, dream: 2.35 },
  engineer: { name: '工程師', salary: 8, stock: 2.0, land: 1.0, dream: 2.10 },
  sales: { name: '超業', salary: 9, stock: 1.5, land: 1.5, dream: 1.95 },
  office: { name: '白領', salary: 5, stock: 2.0, land: 1.0, dream: 2.975 },
  athlete: { name: '運動員', salary: 6, stock: 1.0, land: 1.5, dream: 2.70 },
  rich: { name: '富二代', salary: 10, stock: 1.0, land: 2.0, dream: 1.80 },
};

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 12);
}

function createRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
  if (!values.length) return null;
  return values[Math.floor(Math.random() * values.length)];
}

function stageName(round) {
  if (round <= 9) return '人生起步';
  if (round <= 19) return '人生發展';
  return '人生加速';
}

function rollDice(round) {
  const diceCount = round >= 20 ? 2 : 1;
  const dice = Array.from({ length: diceCount }, () => 1 + Math.floor(Math.random() * 6));
  return {
    dice,
    total: dice.reduce((sum, value) => sum + value, 0),
  };
}

function playerAssets(player, game) {
  return Math.round(
    player.cash
    + (player.stocks * game.stockPrice)
    + (player.land * game.landPrice)
  );
}

function publicRoom(room) {
  const allReady = room.started
    && room.players.length >= 2
    && room.players.every((player) => Boolean(player.profession));

  const game = room.game
    ? {
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
        lastEvent: room.game.lastEvent,
        finished: Boolean(room.game.finished),
      }
    : null;

  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      profession: player.profession || null,
      cash: player.cash || 0,
      stocks: player.stocks || 0,
      land: player.land || 0,
      happiness: player.happiness || 0,
      helpCount: player.helpCount || 0,
      sabotageCount: player.sabotageCount || 0,
      totalAssets: room.game ? playerAssets(player, room.game) : 0,
    })),
    maxPlayers: 6,
    started: Boolean(room.started),
    phase: room.phase || (room.started ? 'profession' : 'lobby'),
    allReady,
    game,
  };
}

function emitRoom(room) {
  io.to(room.code).emit('room:update', publicRoom(room));
}

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

function beginTurn(room) {
  if (room.phase !== 'game' || !room.game || room.game.finished) return;

  clearTurnTimer(room);

  while (room.game.turnIndex < room.game.turnOrder.length) {
    const playerId = room.game.turnOrder[room.game.turnIndex];
    const exists = room.players.some((player) => player.id === playerId);
    if (exists) break;
    room.game.turnIndex += 1;
  }

  if (room.game.turnIndex >= room.game.turnOrder.length) {
    endRound(room);
    return;
  }

  room.game.currentPlayerId = room.game.turnOrder[room.game.turnIndex];
  room.game.turnId = crypto.randomUUID();
  room.game.deadline = Date.now() + TURN_MS;

  const expectedTurnId = room.game.turnId;
  room.turnTimer = setTimeout(() => {
    const currentRoom = rooms.get(room.code);
    if (!currentRoom || currentRoom.phase !== 'game' || !currentRoom.game) return;
    if (currentRoom.game.turnId !== expectedTurnId) return;
    settleSalary(currentRoom, currentRoom.game.currentPlayerId, true);
  }, TURN_MS + 50);

  emitRoom(room);
}

function initializeGame(room) {
  clearTurnTimer(room);
  room.phase = 'game';

  room.players.forEach((player) => {
    player.cash = 0;
    player.stocks = 0;
    player.land = 0;
    player.happiness = 0;
    player.helpCount = 0;
    player.sabotageCount = 0;
  });

  room.game = {
    round: 1,
    stockPrice: 10.00,
    landPrice: 10.00,
    turnOrder: shuffle(room.players.map((player) => player.id)),
    turnIndex: 0,
    currentPlayerId: null,
    turnId: null,
    deadline: null,
    lastEvent: {
      type: 'start',
      text: '職業選擇完成，人生啟程！',
    },
    finished: false,
  };

  beginTurn(room);
}

function advanceTurn(room) {
  if (!room.game || room.phase !== 'game') return;
  clearTurnTimer(room);
  room.game.turnIndex += 1;
  beginTurn(room);
}

function updateMarket(room) {
  const stockUp = Math.random() < 0.65;
  room.game.stockPrice = round2(room.game.stockPrice * (stockUp ? 1.10 : 0.93));
  room.game.landPrice = round2(room.game.landPrice * 1.03);

  return stockUp ? '股票上漲 10%' : '股票下跌 7%';
}

function endRound(room) {
  if (!room.game) return;
  clearTurnTimer(room);

  if (room.game.round >= TOTAL_ROUNDS) {
    room.game.finished = true;
    room.game.currentPlayerId = null;
    room.game.turnId = null;
    room.game.deadline = null;
    room.game.lastEvent = {
      type: 'finish',
      text: '第 30 回合結束，人生旅程完成！',
    };
    room.phase = 'finished';
    emitRoom(room);
    return;
  }

  const marketText = updateMarket(room);
  room.game.round += 1;
  room.game.turnOrder = shuffle(room.players.map((player) => player.id));
  room.game.turnIndex = 0;
  room.game.currentPlayerId = null;
  room.game.turnId = null;
  room.game.deadline = null;
  room.game.lastEvent = {
    type: 'market',
    text: `${marketText}，土地上漲 3%`,
  };

  beginTurn(room);
}

function getActivePlayer(room, playerId) {
  if (!room.game || room.phase !== 'game' || room.game.finished) return null;
  if (room.game.currentPlayerId !== playerId) return null;

  const player = room.players.find((item) => item.id === playerId);
  if (!player || !player.profession || !PROFESSIONS[player.profession]) return null;

  return player;
}

function settleSalary(room, playerId, auto = false) {
  const player = getActivePlayer(room, playerId);
  if (!player) return false;

  const { dice, total } = rollDice(room.game.round);
  const salary = PROFESSIONS[player.profession].salary;
  const income = Math.round(total * salary * 10);
  player.cash += income;

  room.game.lastEvent = {
    type: 'salary',
    playerId,
    dice,
    diceTotal: total,
    amount: income,
    auto,
    text: `${player.name}${auto ? ' 逾時自動' : ''}領薪，現金 +${income}`,
  };

  advanceTurn(room);
  return true;
}

function settleMarketAction(room, playerId, action) {
  const player = getActivePlayer(room, playerId);
  if (!player) return false;

  const profession = PROFESSIONS[player.profession];
  const { dice, total } = rollDice(room.game.round);
  const event = {
    type: action,
    playerId,
    dice,
    diceTotal: total,
  };

  if (action === 'buyStock') {
    const salaryIncome = Math.round(total * profession.salary * 7);
    const cost = Math.round(total * room.game.stockPrice);
    const units = round2(total * profession.stock);
    const availableCash = player.cash + salaryIncome;

    player.cash = availableCash;
    event.salaryIncome = salaryIncome;
    event.cost = cost;
    event.units = units;

    if (availableCash >= cost) {
      player.cash -= cost;
      player.stocks = round2(player.stocks + units);
      event.success = true;
      event.text = `${player.name} 買股成功：70%薪資 +${salaryIncome}，花費 ${cost}，股票 +${units}`;
    } else {
      event.success = false;
      event.text = `${player.name} 買股失敗：現金不足，保留70%薪資 +${salaryIncome}`;
    }
  } else if (action === 'buyLand') {
    const salaryIncome = Math.round(total * profession.salary * 7);
    const cost = Math.round(total * room.game.landPrice);
    const units = round2(total * profession.land);
    const availableCash = player.cash + salaryIncome;

    player.cash = availableCash;
    event.salaryIncome = salaryIncome;
    event.cost = cost;
    event.units = units;

    if (availableCash >= cost) {
      player.cash -= cost;
      player.land = round2(player.land + units);
      event.success = true;
      event.text = `${player.name} 圈地成功：70%薪資 +${salaryIncome}，花費 ${cost}，土地 +${units}`;
    } else {
      event.success = false;
      event.text = `${player.name} 圈地失敗：現金不足，保留70%薪資 +${salaryIncome}`;
    }
  } else if (action === 'sellStock') {
    const salaryIncome = Math.round(total * profession.salary * 5);
    const units = round2(Math.min(total, player.stocks));
    const proceeds = Math.round(units * room.game.stockPrice);

    player.cash += salaryIncome + proceeds;
    player.stocks = round2(Math.max(0, player.stocks - units));
    event.salaryIncome = salaryIncome;
    event.units = units;
    event.proceeds = proceeds;
    event.success = true;
    event.text = units > 0
      ? `${player.name} 賣股：50%薪資 +${salaryIncome}，賣出 ${units} 股，現金 +${proceeds}`
      : `${player.name} 沒有股票可賣，獲得50%薪資 +${salaryIncome}`;
  } else if (action === 'sellLand') {
    const salaryIncome = Math.round(total * profession.salary * 5);
    const units = round2(Math.min(total, player.land));
    const proceeds = Math.round(units * room.game.landPrice);

    player.cash += salaryIncome + proceeds;
    player.land = round2(Math.max(0, player.land - units));
    event.salaryIncome = salaryIncome;
    event.units = units;
    event.proceeds = proceeds;
    event.success = true;
    event.text = units > 0
      ? `${player.name} 賣地：50%薪資 +${salaryIncome}，賣出 ${units} 單位土地，現金 +${proceeds}`
      : `${player.name} 沒有土地可賣，獲得50%薪資 +${salaryIncome}`;
  } else {
    return false;
  }

  room.game.lastEvent = event;
  advanceTurn(room);
  return true;
}

function settleFate(room, playerId) {
  const player = getActivePlayer(room, playerId);
  if (!player) return false;

  const { dice, total } = rollDice(room.game.round);
  const fateIndex = Math.floor(Math.random() * 9);
  const event = {
    type: 'fate',
    playerId,
    dice,
    diceTotal: total,
    fateIndex,
  };

  if (fateIndex === 0) {
    const amount = Math.round(150 * total);
    player.cash += amount;
    event.text = `${player.name} 命運：中樂透，現金 +${amount}`;
  } else if (fateIndex === 1) {
    const requested = Math.round(80 * total);
    const before = player.cash;
    const actual = Math.min(before, requested);
    player.cash -= actual;
    const emptyPenalty = before === 0 && actual === 0;
    if (emptyPenalty) player.happiness = round2(player.happiness - (0.5 * total));
    event.text = emptyPenalty
      ? `${player.name} 命運：花錢消災但現金已空，幸福 -${round2(0.5 * total)}`
      : `${player.name} 命運：花錢消災，現金 -${actual}`;
  } else if (fateIndex === 2) {
    const units = round2(5 * total);
    player.stocks = round2(player.stocks + units);
    event.text = `${player.name} 命運：股神降臨，股票 +${units}`;
  } else if (fateIndex === 3) {
    const requested = round2(2 * total);
    const before = player.stocks;
    const actual = round2(Math.min(before, requested));
    player.stocks = round2(Math.max(0, before - actual));
    const emptyPenalty = before === 0 && actual === 0;
    if (emptyPenalty) player.happiness = round2(player.happiness - (0.5 * total));
    event.text = emptyPenalty
      ? `${player.name} 命運：黑天鵝但股票已空，幸福 -${round2(0.5 * total)}`
      : `${player.name} 命運：黑天鵝，股票 -${actual}`;
  } else if (fateIndex === 4) {
    const units = round2(5 * total);
    player.land = round2(player.land + units);
    event.text = `${player.name} 命運：政策利多，土地 +${units}`;
  } else if (fateIndex === 5) {
    const requested = round2(2 * total);
    const before = player.land;
    const actual = round2(Math.min(before, requested));
    player.land = round2(Math.max(0, before - actual));
    const emptyPenalty = before === 0 && actual === 0;
    if (emptyPenalty) player.happiness = round2(player.happiness - (0.5 * total));
    event.text = emptyPenalty
      ? `${player.name} 命運：土地受創但土地已空，幸福 -${round2(0.5 * total)}`
      : `${player.name} 命運：土地受創，土地 -${actual}`;
  } else if (fateIndex === 6) {
    const perPlayer = Math.round(30 * total);
    let received = 0;
    room.players.forEach((other) => {
      if (other.id === playerId) return;
      const paid = Math.min(other.cash, perPlayer);
      other.cash -= paid;
      received += paid;
    });
    player.cash += received;
    event.text = `${player.name} 命運：社福救濟，其他玩家共支付 ${received}`;
  } else if (fateIndex === 7) {
    const happiness = round2(1 * total);
    player.happiness = round2(player.happiness + happiness);
    event.text = `${player.name} 命運：幸福降臨，幸福 +${happiness}`;
  } else {
    const happiness = round2(0.5 * total);
    player.happiness = round2(player.happiness - happiness);
    event.text = `${player.name} 命運：人生低潮，幸福 -${happiness}`;
  }

  room.game.lastEvent = event;
  advanceTurn(room);
  return true;
}

function chooseSabotageTarget(room, actorId) {
  const others = room.players.filter((player) => player.id !== actorId);
  if (!others.length) return null;

  const ranked = others.map((player) => ({
    player,
    assets: playerAssets(player, room.game),
  }));
  const highestAssets = Math.max(...ranked.map((item) => item.assets));
  const candidates = ranked
    .filter((item) => item.assets === highestAssets)
    .map((item) => item.player);

  return randomChoice(candidates);
}

function settleSabotage(room, playerId) {
  const player = getActivePlayer(room, playerId);
  if (!player) return false;

  const target = chooseSabotageTarget(room, playerId);
  if (!target) return false;

  const { dice, total } = rollDice(room.game.round);
  const effectIndex = Math.floor(Math.random() * 4);
  const bonus = Math.round(40 * total);
  let effectText = '';

  if (effectIndex === 0) {
    const requested = Math.round(80 * total);
    const actual = Math.min(target.cash, requested);
    target.cash -= actual;
    effectText = `${target.name} 現金 -${actual}`;
  } else if (effectIndex === 1) {
    const requested = round2(1 * total);
    const actual = round2(Math.min(target.stocks, requested));
    target.stocks = round2(Math.max(0, target.stocks - actual));
    effectText = `${target.name} 股票 -${actual}`;
  } else if (effectIndex === 2) {
    const requested = round2(1 * total);
    const actual = round2(Math.min(target.land, requested));
    target.land = round2(Math.max(0, target.land - actual));
    effectText = `${target.name} 土地 -${actual}`;
  } else {
    const happiness = round2(0.3 * total);
    target.happiness = round2(target.happiness - happiness);
    effectText = `${target.name} 幸福 -${happiness}`;
  }

  player.cash += bonus;
  player.sabotageCount = (player.sabotageCount || 0) + 1;

  room.game.lastEvent = {
    type: 'sabotage',
    playerId,
    targetId: target.id,
    dice,
    diceTotal: total,
    effectIndex,
    bonus,
    text: `${player.name} 陷害 ${target.name}：${effectText}；自己現金 +${bonus}`,
  };

  advanceTurn(room);
  return true;
}

function chooseHelpTarget(room, actorId) {
  const others = room.players.filter((player) => player.id !== actorId);
  if (!others.length) return null;

  const happinessValues = others.map((player) => Number(player.happiness || 0));
  const maxHappiness = Math.max(...happinessValues);
  const minHappiness = Math.min(...happinessValues);

  const eligible = maxHappiness === minHappiness
    ? others
    : others.filter((player) => Number(player.happiness || 0) < maxHappiness);

  if (!eligible.length) return null;

  const ranked = eligible.map((player) => ({
    player,
    assets: playerAssets(player, room.game),
  }));
  const lowestAssets = Math.min(...ranked.map((item) => item.assets));
  const candidates = ranked
    .filter((item) => item.assets === lowestAssets)
    .map((item) => item.player);

  return randomChoice(candidates);
}

function settleHelp(room, playerId) {
  const player = getActivePlayer(room, playerId);
  if (!player) return false;

  const target = chooseHelpTarget(room, playerId);
  if (!target) return false;

  const { dice, total } = rollDice(room.game.round);
  const effectIndex = Math.floor(Math.random() * 4);
  const bonus = Math.round(60 * total);
  let effectText = '';

  if (effectIndex === 0) {
    const amount = Math.round(100 * total);
    target.cash += amount;
    effectText = `${target.name} 現金 +${amount}`;
  } else if (effectIndex === 1) {
    const units = round2(3 * total);
    target.stocks = round2(target.stocks + units);
    effectText = `${target.name} 股票 +${units}`;
  } else if (effectIndex === 2) {
    const units = round2(3 * total);
    target.land = round2(target.land + units);
    effectText = `${target.name} 土地 +${units}`;
  } else {
    const happiness = round2(0.75 * total);
    target.happiness = round2(target.happiness + happiness);
    effectText = `${target.name} 幸福 +${happiness}`;
  }

  player.cash += bonus;
  player.helpCount = (player.helpCount || 0) + 1;

  room.game.lastEvent = {
    type: 'help',
    playerId,
    targetId: target.id,
    dice,
    diceTotal: total,
    effectIndex,
    bonus,
    text: `${player.name} 援助 ${target.name}：${effectText}；自己現金 +${bonus}`,
  };

  advanceTurn(room);
  return true;
}

function findDreamLiquidation(player, game, deficit) {
  if (deficit <= 0) {
    return {
      stocks: 0,
      land: 0,
      proceeds: 0,
      marketValueMetric: 0,
      surplus: 0,
    };
  }

  const maxStockSteps = Math.floor((round2(player.stocks) * 2) + 1e-9);
  const maxLandSteps = Math.floor((round2(player.land) * 2) + 1e-9);
  const stockPriceCents = Math.round(game.stockPrice * 100);
  const landPriceCents = Math.round(game.landPrice * 100);

  let best = null;

  for (let stockSteps = 0; stockSteps <= maxStockSteps; stockSteps += 1) {
    for (let landSteps = 0; landSteps <= maxLandSteps; landSteps += 1) {
      if (stockSteps === 0 && landSteps === 0) continue;

      const marketValueMetric = (stockSteps * stockPriceCents) + (landSteps * landPriceCents);
      const marketValue = marketValueMetric / 200;
      const proceeds = Math.round(marketValue * 0.8);
      if (proceeds < deficit) continue;

      const candidate = {
        stocks: stockSteps / 2,
        land: landSteps / 2,
        proceeds,
        marketValueMetric,
        surplus: proceeds - deficit,
        stockSteps,
      };

      const isBetter = !best
        || candidate.marketValueMetric < best.marketValueMetric
        || (
          candidate.marketValueMetric === best.marketValueMetric
          && candidate.surplus < best.surplus
        )
        || (
          candidate.marketValueMetric === best.marketValueMetric
          && candidate.surplus === best.surplus
          && candidate.stockSteps > best.stockSteps
        );

      if (isBetter) best = candidate;
    }
  }

  return best;
}

function settleDream(room, playerId) {
  const player = getActivePlayer(room, playerId);
  if (!player) return false;

  const profession = PROFESSIONS[player.profession];
  const { dice, total } = rollDice(room.game.round);
  const salaryIncome = Math.round(total * profession.salary * 3);
  const fee = Math.round(total * 500);
  const cashAfterSalary = player.cash + salaryIncome;
  const deficit = Math.max(0, fee - cashAfterSalary);
  const happinessGain = round2(total * profession.dream);

  const event = {
    type: 'dream',
    playerId,
    dice,
    diceTotal: total,
    salaryIncome,
    fee,
    happinessGain,
  };

  let liquidation = null;

  if (deficit > 0) {
    liquidation = findDreamLiquidation(player, room.game, deficit);
  }

  if (deficit > 0 && !liquidation) {
    player.cash = cashAfterSalary;
    event.success = false;
    event.text = `${player.name} 圓夢失敗：資金不足，保留30%薪資 +${salaryIncome}，股票與土地未出售`;
    room.game.lastEvent = event;
    advanceTurn(room);
    return true;
  }

  const liquidationProceeds = liquidation?.proceeds || 0;
  const soldStocks = liquidation?.stocks || 0;
  const soldLand = liquidation?.land || 0;

  const nextState = {
    cash: cashAfterSalary + liquidationProceeds - fee,
    stocks: round2(Math.max(0, player.stocks - soldStocks)),
    land: round2(Math.max(0, player.land - soldLand)),
    happiness: round2(player.happiness + happinessGain),
  };

  player.cash = nextState.cash;
  player.stocks = nextState.stocks;
  player.land = nextState.land;
  player.happiness = nextState.happiness;

  event.success = true;
  event.liquidation = {
    stocks: soldStocks,
    land: soldLand,
    proceeds: liquidationProceeds,
    discount: 0.8,
  };

  if (liquidation) {
    const soldParts = [];
    if (soldStocks > 0) soldParts.push(`股票 ${soldStocks}`);
    if (soldLand > 0) soldParts.push(`土地 ${soldLand}`);
    event.text = `${player.name} 圓夢成功：30%薪資 +${salaryIncome}，8折變賣${soldParts.join('、')}得 ${liquidationProceeds}，支付 ${fee}，幸福 +${happinessGain}`;
  } else {
    event.text = `${player.name} 圓夢成功：30%薪資 +${salaryIncome}，支付 ${fee}，幸福 +${happinessGain}`;
  }

  room.game.lastEvent = event;
  advanceTurn(room);
  return true;
}

function leaveCurrentRoom(socket) {
  const roomCode = socket.data.roomCode;
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  socket.leave(roomCode);
  delete socket.data.roomCode;

  if (!room) return;

  const wasCurrentPlayer = room.game?.currentPlayerId === socket.id;
  room.players = room.players.filter((player) => player.id !== socket.id);

  if (room.players.length === 0) {
    clearTurnTimer(room);
    rooms.delete(roomCode);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players[0].id;
  }

  if (room.phase === 'game' && room.game && wasCurrentPlayer) {
    advanceTurn(room);
    return;
  }

  emitRoom(room);
}

function findJoinableRoom(name) {
  for (const room of rooms.values()) {
    if (room.started) continue;
    if (room.players.length >= 6) continue;

    const duplicateName = room.players.some(
      (player) => player.name.toLowerCase() === name.toLowerCase()
    );

    if (!duplicateName) return room;
  }

  return null;
}

function createRoomFor(socket, name) {
  const code = createRoomCode();
  const room = {
    code,
    hostId: socket.id,
    players: [{ id: socket.id, name, profession: null }],
    started: false,
    phase: 'lobby',
    game: null,
    turnTimer: null,
  };

  rooms.set(code, room);
  socket.join(code);
  socket.data.roomCode = code;
  return room;
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.emit('server:ready', {
    message: '《人生》伺服器連線成功',
    socketId: socket.id,
  });

  socket.on('room:autoJoin', (payload, reply) => {
    const name = cleanName(payload?.name);

    if (!name) {
      return reply?.({ ok: false, message: '請輸入暱稱' });
    }

    leaveCurrentRoom(socket);

    let room = findJoinableRoom(name);

    if (room) {
      room.players.push({ id: socket.id, name, profession: null });
      socket.join(room.code);
      socket.data.roomCode = room.code;
    } else {
      room = createRoomFor(socket, name);
    }

    reply?.({ ok: true, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on('room:start', (reply) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);

    if (!room) {
      return reply?.({ ok: false, message: '目前不在房間內。' });
    }

    if (room.hostId !== socket.id) {
      return reply?.({ ok: false, message: '只有房主可以啟程。' });
    }

    if (room.started) {
      return reply?.({ ok: true, room: publicRoom(room) });
    }

    if (room.players.length < 2) {
      return reply?.({ ok: false, message: '至少需要2位玩家才能啟程。' });
    }

    room.started = true;
    room.phase = 'profession';
    room.players.forEach((player) => {
      player.profession = null;
    });

    const snapshot = publicRoom(room);
    reply?.({ ok: true, room: snapshot });
    io.to(room.code).emit('room:started', snapshot);
  });

  socket.on('room:chooseProfession', (payload, reply) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    const professionId = String(payload?.profession || '');

    if (!room || room.phase !== 'profession') {
      return reply?.({ ok: false, message: '目前還不能選擇職業。' });
    }

    if (!PROFESSIONS[professionId]) {
      return reply?.({ ok: false, message: '這個職業不存在。' });
    }

    const player = room.players.find((item) => item.id === socket.id);
    if (!player) {
      return reply?.({ ok: false, message: '找不到玩家資料。' });
    }

    const occupied = room.players.some(
      (item) => item.id !== socket.id && item.profession === professionId
    );

    if (occupied) {
      return reply?.({ ok: false, message: '這個職業已被其他玩家選走。' });
    }

    player.profession = professionId;

    const allReady = room.players.length >= 2
      && room.players.every((item) => Boolean(item.profession));

    if (allReady) {
      initializeGame(room);
    }

    const snapshot = publicRoom(room);
    reply?.({ ok: true, room: snapshot });
    emitRoom(room);
  });

  socket.on('game:action', (payload, reply) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);
    const action = String(payload?.action || '');
    const turnId = String(payload?.turnId || '');

    if (!room || room.phase !== 'game' || !room.game || room.game.finished) {
      return reply?.({ ok: false, message: '目前不在遊戲回合中。' });
    }

    if (room.game.currentPlayerId !== socket.id) {
      return reply?.({ ok: false, message: '還沒輪到你。' });
    }

    if (room.game.turnId !== turnId) {
      return reply?.({ ok: false, message: '這個回合已經結束。' });
    }

    if (Date.now() >= room.game.deadline) {
      return reply?.({ ok: false, message: '本回合時間已到。' });
    }

    const availableActions = new Set([
      'salary',
      'buyStock',
      'buyLand',
      'fate',
      'sabotage',
      'help',
      'sellStock',
      'sellLand',
      'dream',
    ]);

    if (!availableActions.has(action)) {
      return reply?.({ ok: false, message: '這個行動尚未開放。' });
    }

    let settled = false;

    if (action === 'salary') {
      settled = settleSalary(room, socket.id, false);
    } else if (['buyStock', 'buyLand', 'sellStock', 'sellLand'].includes(action)) {
      settled = settleMarketAction(room, socket.id, action);
    } else if (action === 'fate') {
      settled = settleFate(room, socket.id);
    } else if (action === 'sabotage') {
      if (room.players.length < 2) {
        return reply?.({ ok: false, message: '目前沒有可以陷害的玩家。' });
      }
      settled = settleSabotage(room, socket.id);
    } else if (action === 'help') {
      if (!chooseHelpTarget(room, socket.id)) {
        return reply?.({ ok: false, message: '目前沒有可以援助的玩家。' });
      }
      settled = settleHelp(room, socket.id);
    } else if (action === 'dream') {
      settled = settleDream(room, socket.id);
    }

    if (!settled) {
      return reply?.({ ok: false, message: '目前無法完成這個行動。' });
    }

    reply?.({ ok: true, room: publicRoom(room) });
  });

  socket.on('room:leave', (reply) => {
    leaveCurrentRoom(socket);
    reply?.({ ok: true });
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    leaveCurrentRoom(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Life Game server listening on port ${PORT}`);
});
