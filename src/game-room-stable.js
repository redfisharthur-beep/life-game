import { GameRoom as CoreGameRoom } from './game-room.js';

const DISCONNECT_GRACE_MS = 90_000;

const EXTRA_PROFESSIONS = {
  civilServant: { name: '公務員', salary: 6.5, stock: 1.5, land: 1.5, dream: 2.35 },
  artist: { name: '藝人', salary: 8, stock: 1.25, land: 0.75, dream: 2.55 },
};

const BASE_PROFESSIONS = {
  doctor: { name: '醫師', salary: 7, stock: 1.5, land: 2.0, dream: 2.25 },
  engineer: { name: '資訊工程師', salary: 8, stock: 2.0, land: 1.0, dream: 2.20 },
  sales: { name: '超級業務員', salary: 9, stock: 1.5, land: 1.5, dream: 2.05 },
  office: { name: '白領上班族', salary: 5, stock: 2.0, land: 1.0, dream: 2.60 },
  athlete: { name: '職棒球員', salary: 6, stock: 1.0, land: 1.5, dream: 2.45 },
  rich: { name: '企業富二代', salary: 10, stock: 1.0, land: 2.0, dream: 2.00 },
};

const ALL_PROFESSIONS = { ...BASE_PROFESSIONS, ...EXTRA_PROFESSIONS };

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function rollDice(round, forceDoubleDice = false) {
  const diceCount = forceDoubleDice || round >= 16 ? 2 : 1;
  const dice = Array.from({ length: diceCount }, () => 1 + Math.floor(Math.random() * 6));
  return { dice, total: dice.reduce((sum, value) => sum + value, 0) };
}

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

  getActivePlayer(room, playerId) {
    if (!room.game || room.phase !== 'game' || room.game.finished) return null;
    if (room.game.currentPlayerId !== playerId) return null;
    const player = room.players.find((item) => item.id === playerId);
    if (!player || !player.profession || !ALL_PROFESSIONS[player.profession]) return null;
    return player;
  }

  async settleSalary(room, playerId, auto = false) {
    const player = this.getActivePlayer(room, playerId);
    if (!player) return false;
    const { dice, total } = rollDice(room.game.round, room.game.forceDoubleDice);
    const salary = ALL_PROFESSIONS[player.profession].salary;
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
    const profession = ALL_PROFESSIONS[player.profession];
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

  async settleDream(room, playerId) {
    const player = this.getActivePlayer(room, playerId);
    if (!player) return false;
    const profession = ALL_PROFESSIONS[player.profession];
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

    if (event === 'room:resume') {
      const room = await this.getRoom();
      const player = this.findPlayer(room, attachment.playerId, attachment.reconnectToken);
      if (player?.disconnectDeadline) {
        player.disconnectDeadline = null;
        await this.saveRoom(room);
      }
    }

    if (event === 'room:chooseProfession' && EXTRA_PROFESSIONS[String(message?.payload?.profession || '')]) {
      const room = await this.getRoom();
      const player = this.findPlayer(room, attachment.playerId, attachment.reconnectToken);
      const requestId = message?.requestId || null;
      const professionId = String(message?.payload?.profession || '');

      if (!player) {
        this.ack(socket, requestId, { ok: false, message: '玩家驗證失敗，請重新加入。' });
      } else if (room.phase !== 'profession') {
        this.ack(socket, requestId, { ok: false, message: '目前還不能選擇職業。' });
      } else if (room.players.some((item) => item.id !== player.id && item.profession === professionId)) {
        this.ack(socket, requestId, { ok: false, message: '這個職業已被其他玩家選走。' });
      } else {
        player.profession = professionId;
        if (room.players.length >= 2 && room.players.every((item) => Boolean(item.profession))) {
          await this.initializeGame(room);
          this.ack(socket, requestId, { ok: true, room: this.publicRoom(room) });
        } else {
          await this.broadcastRoom(room);
          this.ack(socket, requestId, { ok: true, room: this.publicRoom(room) });
        }
      }

      const latest = await this.getRoom();
      await this.reschedule(latest);
      return;
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
