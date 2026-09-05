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

const PROFESSION_AUTO_PICK_MS = 60_000;
const SOLO_PLAYER_COUNT = 6;
const AI_NAMES = ['AI・阿哲', 'AI・小晴', 'AI・阿凱', 'AI・米米', 'AI・阿倫'];
const ALL_PROFESSIONS = ['doctor', 'engineer', 'sales', 'office', 'athlete', 'rich', 'civilServant', 'artist'];
const PROFESSION_STYLE = {
  doctor: { salary: 7, stock: 1.5, land: 2.0, dream: 2.25 },
  engineer: { salary: 8, stock: 2.0, land: 1.0, dream: 2.20 },
  sales: { salary: 9, stock: 1.5, land: 1.5, dream: 2.05 },
  office: { salary: 5, stock: 2.0, land: 1.0, dream: 2.60 },
  athlete: { salary: 6, stock: 1.0, land: 1.5, dream: 2.45 },
  rich: { salary: 10, stock: 1.0, land: 2.0, dream: 2.00 },
  civilServant: { salary: 6.5, stock: 1.5, land: 1.5, dream: 2.35 },
  artist: { salary: 8, stock: 1.25, land: 0.75, dream: 2.55 },
};

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

function jitter(amount = 4) {
  return (Math.random() - 0.5) * amount;
}

export class GameRoom extends MilestoneGameRoom {
  publicRoom(room) {
    const snapshot = super.publicRoom(room);
    if (!snapshot?.players) return snapshot;
    const aiIds = new Set((room?.players || []).filter((player) => player.isAI).map((player) => player.id));
    snapshot.singlePlayerMode = Boolean(room?.singlePlayerMode);
    snapshot.players = snapshot.players.map((player) => ({ ...player, isAI: aiIds.has(player.id) }));
    return snapshot;
  }

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

  prepareSinglePlayerRoom(room, player) {
    if (!room || !player || room.phase !== 'lobby' || room.started) return false;

    // 先清掉等待室殘留的離線真人；目前按下啟程的玩家一定保留。
    room.players = room.players.filter((item) => (
      item.id === player.id || item.isAI || Boolean(item.connected)
    ));

    const humans = room.players.filter((item) => !item.isAI);
    if (humans.length !== 1 || humans[0].id !== player.id) return false;

    room.singlePlayerMode = true;
    room.players = room.players.filter((item) => !item.isAI);

    const usedNames = new Set(room.players.map((item) => item.name));
    const names = AI_NAMES.filter((name) => !usedNames.has(name));
    while (room.players.length < SOLO_PLAYER_COUNT) {
      const index = room.players.length - 1;
      const name = names[index] || `AI・玩家${index + 1}`;
      room.players.push({
        id: crypto.randomUUID(),
        reconnectToken: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
        connected: true,
        joinedAt: Number.MAX_SAFE_INTEGER,
        isAI: true,
        name,
        profession: null,
        cash: 0,
        stocks: 0,
        land: 0,
        happiness: 0,
        helpCount: 0,
        sabotageCount: 0,
      });
    }
    return true;
  }

  assignAIProfessions(room) {
    if (!room?.singlePlayerMode || room.phase !== 'profession') return false;
    const human = room.players.find((player) => !player.isAI);
    if (!human?.profession) return false;

    const used = new Set(room.players.map((player) => player.profession).filter(Boolean));
    const available = shuffle(ALL_PROFESSIONS.filter((id) => !used.has(id)));
    let changed = false;

    room.players.filter((player) => player.isAI && !player.profession).forEach((player) => {
      const profession = available.shift();
      if (!profession) return;
      player.profession = profession;
      player.connected = false;
      changed = true;
    });
    return changed;
  }

  chooseStrategicAIAction(room, playerId) {
    const player = room.players.find((item) => item.id === playerId);
    if (!player || !room?.game) return randomChoice(this.getAvailableAutoActions(room, playerId));

    const available = new Set(this.getAvailableAutoActions(room, playerId));
    const game = room.game;
    const round = Number(game.round || 1);
    const totalRounds = Number(game.totalRounds || 30);
    const progress = Math.min(1, round / Math.max(1, totalRounds));
    const style = PROFESSION_STYLE[player.profession] || { salary: 7, stock: 1.4, land: 1.4, dream: 2.3 };
    const cash = Number(player.cash || 0);
    const stocks = Number(player.stocks || 0);
    const land = Number(player.land || 0);
    const happiness = Number(player.happiness || 0);
    const stockPrice = Number(game.stockPrice || 10);
    const landPrice = Number(game.landPrice || 10);
    const assets = typeof this.playerAssets === 'function' ? Number(this.playerAssets(player, game) || 0) : cash + stocks * stockPrice + land * landPrice;
    const opponents = room.players.filter((item) => item.id !== playerId);
    const bestOpponentHappiness = Math.max(0, ...opponents.map((item) => Number(item.happiness || 0)));
    const behindHappiness = Math.max(0, bestOpponentHappiness - happiness);
    const diceExpectation = game.forceTripleDice ? 10.5 : (game.forceDoubleDice || round >= 16 ? 7 : 3.5);
    const expectedDreamFee = diceExpectation * 500;
    const liquidValue = cash + (stocks * stockPrice * 0.8) + (land * landPrice * 0.8);

    const scores = {
      salary: 20 + (cash < 1000 ? 24 : 0) + style.salary * 1.5 - progress * 5,
      buyStock: 17 + style.stock * 12 + Math.max(-12, (12 - stockPrice) * 2.2) + (1 - progress) * 10,
      buyLand: 18 + style.land * 12 + Math.max(-12, (13 - landPrice) * 1.8) + (1 - progress) * 9,
      fate: 11 + Math.min(14, behindHappiness * 1.3) + (assets < 2500 ? 5 : 0),
      sabotage: 10 + progress * 16 + Math.min(12, behindHappiness * 1.4),
      help: 12 + (cash < 1500 ? 7 : 2) + progress * 5,
      sellStock: stocks > 0 ? 8 + Math.max(0, stockPrice - 11) * 3.5 + progress * 10 : -100,
      sellLand: land > 0 ? 7 + Math.max(0, landPrice - 12) * 3 + progress * 9 : -100,
      dream: liquidValue >= expectedDreamFee
        ? 16 + style.dream * 11 + progress * 26 + Math.min(18, behindHappiness * 1.8)
        : -35,
    };

    // 高價資產不追高；接近終局時優先把可變現資產轉成圓夢資金。
    if (stockPrice > 18) scores.buyStock -= 18;
    if (landPrice > 20) scores.buyLand -= 15;
    if (progress > 0.72 && liquidValue >= expectedDreamFee) scores.dream += 14;
    if (progress > 0.8 && stocks > 0 && cash < expectedDreamFee) scores.sellStock += 12;
    if (progress > 0.8 && land > 0 && cash < expectedDreamFee) scores.sellLand += 10;
    if (happiness >= bestOpponentHappiness && progress > 0.7) scores.sabotage += 8;

    let bestAction = null;
    let bestScore = -Infinity;
    for (const action of available) {
      const score = Number(scores[action] ?? 0) + jitter();
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
    return bestAction || randomChoice([...available]);
  }

  async settleRandomAutoAction(room, playerId, reason = 'timeout') {
    const player = room.players.find((item) => item.id === playerId);
    if (!player || !room?.game) return false;

    const action = player.isAI
      ? this.chooseStrategicAIAction(room, playerId)
      : randomChoice(this.getAvailableAutoActions(room, playerId));
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
      room.game.lastEvent.autoReason = player.isAI ? 'ai-strategy' : reason;
      room.game.lastEvent.ai = Boolean(player.isAI);
    }
    return settled;
  }

  async handleSinglePlayerRestart(socket, attachment, message) {
    const room = await this.getRoom();
    if (!room?.singlePlayerMode || room.phase !== 'finished') return false;
    const requestId = message?.requestId || null;
    const player = this.findPlayer(room, attachment.playerId, attachment.reconnectToken);
    if (!player || player.isAI) {
      this.ack(socket, requestId, { ok: false, message: '玩家驗證失敗，請重新加入。' });
      return true;
    }
    if (room.hostId !== player.id) {
      this.ack(socket, requestId, { ok: false, message: '只有房主可以開啟下一局。' });
      return true;
    }

    room.started = true;
    room.phase = 'profession';
    room.game = null;
    room.professionDeadline = Date.now() + PROFESSION_AUTO_PICK_MS;
    room.finishedCleanupAt = null;
    room.players.forEach((item) => {
      item.profession = null;
      item.cash = 0;
      item.stocks = 0;
      item.land = 0;
      item.happiness = 0;
      item.helpCount = 0;
      item.sabotageCount = 0;
      item.connected = item.isAI ? false : true;
    });
    await this.saveRoom(room);
    await this.scheduleAt(room.professionDeadline);
    if (typeof this.syncMatchmaker === 'function') await this.syncMatchmaker(room);
    const snapshot = this.publicRoom(room);
    this.ack(socket, requestId, { ok: true, room: snapshot });
    this.broadcast('room:started', snapshot);
    this.broadcast('room:update', snapshot);
    return true;
  }

  // 正式啟程或「再來一局」進入職業選擇後，將自動選職倒數統一改為 1 分鐘。
  async handleSocketEvent(socket, attachment, message) {
    const event = String(message?.event || '');

    if (event === 'game:restart' && await this.handleSinglePlayerRestart(socket, attachment, message)) return;

    if (event === 'room:start') {
      const room = await this.getRoom();
      const player = this.findPlayer(room, attachment.playerId, attachment.reconnectToken);
      if (player && room.hostId === player.id && !room.started) {
        if (this.prepareSinglePlayerRoom(room, player)) await this.saveRoom(room);
      }
    }

    await super.handleSocketEvent(socket, attachment, message);

    let room = await this.getRoom();

    if (event === 'room:chooseProfession' && room.singlePlayerMode && room.phase === 'profession') {
      const human = room.players.find((item) => !item.isAI);
      if (human?.profession) {
        this.assignAIProfessions(room);
        if (room.players.length >= 2 && room.players.every((item) => Boolean(item.profession))) {
          room.professionDeadline = null;
          await this.initializeGame(room);
          room = await this.getRoom();
          this.broadcast('room:update', this.publicRoom(room));
          return;
        }
        await this.saveRoom(room);
      }
    }

    if (event !== 'room:start' && event !== 'game:restart') return;

    room = await this.getRoom();
    if (room.phase !== 'profession' || !room.started) return;

    room.professionDeadline = Date.now() + PROFESSION_AUTO_PICK_MS;
    await this.saveRoom(room);
    this.broadcast('room:update', this.publicRoom(room));
    await this.reschedule(room);
  }

  // 真人逾時仍維持原本隨機選項；AI 則依資產、行情、幸福與剩餘輪數策略行動。
  async settleSalary(room, playerId, auto = false) {
    if (!auto) return super.settleSalary(room, playerId, false);
    const player = room.players.find((item) => item.id === playerId);
    return this.settleRandomAutoAction(room, playerId, player?.connected ? 'timeout' : 'offline');
  }

  // 輪到 AI 或已離線玩家時不空等倒數，直接執行自動行動。
  async beginTurn(room) {
    await super.beginTurn(room);

    if (!room?.game || room.phase !== 'game' || room.game.finished) return;
    const playerId = room.game.currentPlayerId;
    const turnId = room.game.turnId;
    if (!playerId || !turnId || room.game.turnProcessed || !room.game.deadline) return;

    const player = room.players.find((item) => item.id === playerId);
    if (!player || (player.connected && !player.isAI)) return;

    if (this.claimTurn(room, playerId, turnId)) {
      const settled = await this.settleRandomAutoAction(room, playerId, player.isAI ? 'ai-strategy' : 'offline');
      if (!settled) {
        room.game.turnProcessed = false;
        await super.settleSalary(room, playerId, false);
      }
    }
  }
}
