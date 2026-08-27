const socket = io();

const entryPanel = document.getElementById('entryPanel');
const roomPanel = document.getElementById('roomPanel');
const professionPanel = document.getElementById('professionPanel');
const gamePanel = document.getElementById('gamePanel');
const playerNameInput = document.getElementById('playerName');
const joinGameBtn = document.getElementById('joinGameBtn');
const startGameBtn = document.getElementById('startGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const messageEl = document.getElementById('message');
const launchMessageEl = document.getElementById('launchMessage');
const playerCountEl = document.getElementById('playerCount');
const playerListEl = document.getElementById('playerList');
const professionGridEl = document.getElementById('professionGrid');
const professionMessageEl = document.getElementById('professionMessage');
const stageNameEl = document.getElementById('stageName');
const roundLabelEl = document.getElementById('roundLabel');
const stockPriceEl = document.getElementById('stockPrice');
const landPriceEl = document.getElementById('landPrice');
const myNameEl = document.getElementById('myName');
const myProfessionEl = document.getElementById('myProfession');
const myCashEl = document.getElementById('myCash');
const myStocksEl = document.getElementById('myStocks');
const myLandEl = document.getElementById('myLand');
const myHappinessEl = document.getElementById('myHappiness');
const turnTimerEl = document.getElementById('turnTimer');
const turnOrderEl = document.getElementById('turnOrder');
const turnNoticeEl = document.getElementById('turnNotice');
const gameEventEl = document.getElementById('gameEvent');
const actionHintEl = document.querySelector('.action-hint');
const actionButtons = [...document.querySelectorAll('.action-button')];
const gameResultsEl = document.getElementById('gameResults');
const resultWinnerEl = document.getElementById('resultWinner');
const rankingListEl = document.getElementById('rankingList');
const restartGameBtn = document.getElementById('restartGameBtn');
const leaveGameBtn = document.getElementById('leaveGameBtn');
const roundAnnouncementEl = document.getElementById('roundAnnouncement');

const SESSION_KEYS = {
  roomCode: 'lifeGame.roomCode',
  playerId: 'lifeGame.playerId',
  reconnectToken: 'lifeGame.reconnectToken',
  playerName: 'lifeGame.playerName',
};

const ACTIVE_ACTIONS = new Set([
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

const PROFESSIONS = [
  {
    id: 'doctor',
    name: '醫師',
    image: '/images/doctor.png',
    abilities: [
      { label: '薪資', grade: 'B' },
      { label: '選股', grade: 'A' },
      { label: '圈地', grade: 'S' },
      { label: '圓夢', grade: 'B' },
    ],
  },
  {
    id: 'engineer',
    name: '資訊工程師',
    image: '/images/engineer.png',
    abilities: [
      { label: '薪資', grade: 'A' },
      { label: '選股', grade: 'S' },
      { label: '圈地', grade: 'C' },
      { label: '圓夢', grade: 'B' },
    ],
  },
  {
    id: 'sales',
    name: '超級業務員',
    image: '/images/sales.png',
    abilities: [
      { label: '薪資', grade: 'A' },
      { label: '選股', grade: 'A' },
      { label: '圈地', grade: 'A' },
      { label: '圓夢', grade: 'C' },
    ],
  },
  {
    id: 'office',
    name: '白領上班族',
    image: '/images/office.png',
    abilities: [
      { label: '薪資', grade: 'C' },
      { label: '選股', grade: 'S' },
      { label: '圈地', grade: 'C' },
      { label: '圓夢', grade: 'S' },
    ],
  },
  {
    id: 'athlete',
    name: '職棒球員',
    image: '/images/athlete.png',
    abilities: [
      { label: '薪資', grade: 'B' },
      { label: '選股', grade: 'C' },
      { label: '圈地', grade: 'A' },
      { label: '圓夢', grade: 'A' },
    ],
  },
  {
    id: 'rich',
    name: '企業富二代',
    image: '/images/rich.png',
    abilities: [
      { label: '薪資', grade: 'S' },
      { label: '選股', grade: 'C' },
      { label: '圈地', grade: 'S' },
      { label: '圓夢', grade: 'C' },
    ],
  },
];

const PROFESSION_BY_ID = Object.fromEntries(
  PROFESSIONS.map((profession) => [profession.id, profession])
);

let currentRoom = null;
let myPlayerId = localStorage.getItem(SESSION_KEYS.playerId) || null;
let serverClockOffset = 0;
let resumeInFlight = false;
let lastResumeSocketId = null;
let accelerationTimer = null;

const savedName = localStorage.getItem(SESSION_KEYS.playerName);
if (savedName) playerNameInput.value = savedName;

function setMessage(text, type = '') {
  messageEl.textContent = text || '';
  messageEl.className = `message ${type}`.trim();
}

function setLaunchMessage(text, type = '') {
  launchMessageEl.textContent = text || '';
  launchMessageEl.className = `launch-message ${type}`.trim();
}

function setProfessionMessage(text, type = '') {
  professionMessageEl.textContent = text || '';
  professionMessageEl.className = `profession-message ${type}`.trim();
}

function updateServerClock(room) {
  if (Number.isFinite(Number(room?.serverTime))) {
    serverClockOffset = Number(room.serverTime) - Date.now();
  }
}

function serverNow() {
  return Date.now() + serverClockOffset;
}

function saveSession(session) {
  if (!session?.roomCode || !session?.playerId || !session?.reconnectToken) return;
  localStorage.setItem(SESSION_KEYS.roomCode, session.roomCode);
  localStorage.setItem(SESSION_KEYS.playerId, session.playerId);
  localStorage.setItem(SESSION_KEYS.reconnectToken, session.reconnectToken);
  if (session.name) localStorage.setItem(SESSION_KEYS.playerName, session.name);
  myPlayerId = session.playerId;
}

function clearSession({ keepName = true } = {}) {
  localStorage.removeItem(SESSION_KEYS.roomCode);
  localStorage.removeItem(SESSION_KEYS.playerId);
  localStorage.removeItem(SESSION_KEYS.reconnectToken);
  if (!keepName) localStorage.removeItem(SESSION_KEYS.playerName);
  myPlayerId = null;
}

function getStoredSession() {
  const roomCode = localStorage.getItem(SESSION_KEYS.roomCode);
  const playerId = localStorage.getItem(SESSION_KEYS.playerId);
  const reconnectToken = localStorage.getItem(SESSION_KEYS.reconnectToken);
  if (!roomCode || !playerId || !reconnectToken) return null;
  return { roomCode, playerId, reconnectToken };
}

function getPlayerName() {
  return playerNameInput.value.trim();
}

function hideAllPanels() {
  entryPanel.classList.add('hidden');
  roomPanel.classList.add('hidden');
  professionPanel.classList.add('hidden');
  gamePanel.classList.add('hidden');
}

function showEntry(message = '', type = '') {
  currentRoom = null;
  hideAllPanels();
  entryPanel.classList.remove('hidden');
  setMessage(message, type);
  setLaunchMessage('');
  setProfessionMessage('');
}

function showLobby(room) {
  currentRoom = room;
  hideAllPanels();
  roomPanel.classList.remove('hidden');
  renderRoom(room);
}

function showProfession(room) {
  currentRoom = room;
  hideAllPanels();
  professionPanel.classList.remove('hidden');
  renderProfessions(room);
}

function showGame(room) {
  currentRoom = room;
  hideAllPanels();
  gamePanel.classList.remove('hidden');
  renderGame(room);
}

function applyRoomView(room) {
  if (!room) return;
  updateServerClock(room);
  currentRoom = room;

  if (room.phase === 'game' || room.phase === 'finished') {
    showGame(room);
  } else if (room.phase === 'profession') {
    showProfession(room);
  } else {
    showLobby(room);
  }
}

function renderRoom(room) {
  if (!room) return;

  updateServerClock(room);
  currentRoom = room;
  playerCountEl.textContent = `${room.players.length} / ${room.maxPlayers}`;

  playerListEl.innerHTML = '';
  room.players.forEach((player) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    if (!player.connected) row.classList.add('offline');

    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = player.connected ? player.name : `${player.name}（離線）`;

    const badge = document.createElement('span');
    badge.className = 'badge';
    if (player.id === room.hostId) {
      badge.textContent = '房主';
    } else {
      badge.textContent = '';
      badge.classList.add('empty');
    }

    row.append(name, badge);
    playerListEl.appendChild(row);
  });

  const isHost = myPlayerId === room.hostId;
  const hasEnoughPlayers = room.players.length >= 2;
  const canStart = isHost && hasEnoughPlayers && !room.started;

  startGameBtn.disabled = !canStart;
  startGameBtn.textContent = isHost ? '啟程' : '等待房主啟程';
  setLaunchMessage('');
}

function renderProfessions(room) {
  if (!room) return;

  updateServerClock(room);
  currentRoom = room;
  professionGridEl.innerHTML = '';

  const me = room.players.find((player) => player.id === myPlayerId);

  PROFESSIONS.forEach((profession) => {
    const selectedBy = room.players.find((player) => player.profession === profession.id);
    const selectedByMe = selectedBy?.id === myPlayerId;
    const takenByOther = Boolean(selectedBy && !selectedByMe);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'profession-card';
    button.dataset.profession = profession.id;
    button.disabled = takenByOther;

    if (selectedByMe) button.classList.add('selected');
    if (takenByOther) button.classList.add('taken');

    const visual = document.createElement('span');
    visual.className = 'profession-visual';

    const image = document.createElement('img');
    image.className = 'profession-image';
    image.src = profession.image;
    image.alt = profession.name;

    const name = document.createElement('span');
    name.className = 'profession-name';
    name.textContent = profession.name;

    visual.append(image, name);

    const detail = document.createElement('span');
    detail.className = 'profession-detail';

    const abilities = document.createElement('span');
    abilities.className = 'profession-abilities';
    abilities.innerHTML = profession.abilities.map(({ label, grade }) => (
      `<span class="ability-item"><span class="ability-label">${label}</span><span class="ability-grade grade-${grade.toLowerCase()}">${grade}</span></span>`
    )).join('');

    const state = document.createElement('span');
    state.className = 'profession-state';
    if (selectedByMe) {
      state.textContent = '你的選擇';
    } else if (takenByOther) {
      state.textContent = `${selectedBy.name} 已選`;
    } else {
      state.textContent = '選擇';
    }

    detail.append(abilities, state);
    button.append(visual, detail);
    button.addEventListener('click', () => chooseProfession(profession.id));
    professionGridEl.appendChild(button);
  });

  if (room.allReady) {
    setProfessionMessage('全員選擇完成 ✓');
  } else if (me?.profession) {
    setProfessionMessage('已選擇職業，等待其他玩家…');
  } else {
    setProfessionMessage('');
  }
}

function formatAsset(value) {
  return Number(value || 0).toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function renderResults(room) {
  const results = room?.game?.results;
  if (!gameResultsEl || !rankingListEl || !resultWinnerEl) return;

  if (!results?.rankings?.length) {
    gameResultsEl.classList.add('hidden');
    return;
  }

  gameResultsEl.classList.remove('hidden');
  rankingListEl.innerHTML = '';

  const winners = results.rankings.filter((entry) => entry.rank === 1);
  resultWinnerEl.textContent = winners.length > 1
    ? `共同第一：${winners.map((entry) => entry.name).join('、')}`
    : `第一名：${winners[0].name}`;

  results.rankings.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'ranking-card';
    if (entry.rank === 1) card.classList.add('winner');
    if (entry.playerId === myPlayerId) card.classList.add('me');

    const top = document.createElement('div');
    top.className = 'ranking-card-top';

    const rank = document.createElement('strong');
    rank.className = 'ranking-number';
    rank.textContent = `第 ${entry.rank} 名`;

    const identity = document.createElement('div');
    identity.className = 'ranking-identity';
    const playerName = document.createElement('strong');
    playerName.textContent = entry.name;
    const profession = document.createElement('span');
    profession.textContent = PROFESSION_BY_ID[entry.profession]?.name || '未選職業';
    identity.append(playerName, profession);
    top.append(rank, identity);

    const stats = document.createElement('div');
    stats.className = 'ranking-stats';
    stats.innerHTML = `
      <span><small>幸福</small><b>${Number(entry.happiness || 0).toFixed(2)}</b></span>
      <span><small>總資產</small><b>${formatAsset(entry.totalAssets)}</b></span>
      <span><small>援助</small><b>${entry.helpCount || 0}</b></span>
    `;

    const titles = document.createElement('div');
    titles.className = 'ranking-titles';
    (entry.titles || []).forEach((title) => {
      const badge = document.createElement('span');
      badge.textContent = title;
      titles.appendChild(badge);
    });

    card.append(top, stats, titles);
    rankingListEl.appendChild(card);
  });

  const isHost = myPlayerId === room.hostId;
  if (restartGameBtn) {
    restartGameBtn.disabled = !isHost;
    restartGameBtn.textContent = isHost ? '再來一局' : '等待房主再開一局';
  }
}

function renderAcceleration(room) {
  if (!roundAnnouncementEl) return;
  if (accelerationTimer) {
    clearTimeout(accelerationTimer);
    accelerationTimer = null;
  }

  const until = Number(room?.game?.transitionUntil || 0);
  const remaining = until - serverNow();
  if (room?.game?.round !== 20 || remaining <= 0) {
    roundAnnouncementEl.classList.add('hidden');
    return;
  }

  roundAnnouncementEl.classList.remove('hidden');
  accelerationTimer = setTimeout(() => {
    roundAnnouncementEl.classList.add('hidden');
  }, Math.max(0, remaining));
}

function renderGame(room) {
  if (!room?.game) return;

  updateServerClock(room);
  currentRoom = room;
  const game = room.game;
  const me = room.players.find((player) => player.id === myPlayerId);
  const currentPlayer = room.players.find((player) => player.id === game.currentPlayerId);
  const finished = room.phase === 'finished' || game.finished;

  gamePanel.classList.toggle('finished-mode', finished);
  stageNameEl.textContent = game.stageName;
  roundLabelEl.textContent = `第 ${game.round} / ${game.totalRounds} 回合`;
  stockPriceEl.textContent = Number(game.stockPrice).toFixed(2);
  landPriceEl.textContent = Number(game.landPrice).toFixed(2);

  if (me) {
    myNameEl.textContent = me.name;
    myProfessionEl.textContent = PROFESSION_BY_ID[me.profession]?.name || '未選職業';
    myCashEl.textContent = Math.round(me.cash || 0);
    myStocksEl.textContent = Number(me.stocks || 0).toLocaleString('zh-TW', { maximumFractionDigits: 1 });
    myLandEl.textContent = Number(me.land || 0).toLocaleString('zh-TW', { maximumFractionDigits: 1 });
    myHappinessEl.textContent = Number(me.happiness || 0).toFixed(2);
  }

  turnOrderEl.innerHTML = '';
  game.turnOrder.forEach((playerId, index) => {
    const player = room.players.find((item) => item.id === playerId);
    if (!player) return;

    const chip = document.createElement('span');
    chip.className = 'turn-chip';
    chip.textContent = player.name;
    if (playerId === game.currentPlayerId) chip.classList.add('current');
    if (index < game.turnIndex) chip.classList.add('done');
    if (playerId === myPlayerId) chip.classList.add('me');
    turnOrderEl.appendChild(chip);
  });

  const isMyTurn = game.currentPlayerId === myPlayerId && room.phase === 'game' && !game.finished;

  if (finished) {
    turnNoticeEl.textContent = '30 回合完成';
  } else if (isMyTurn) {
    turnNoticeEl.textContent = '輪到你了！請選擇行動';
  } else {
    turnNoticeEl.textContent = currentPlayer ? `等待 ${currentPlayer.name} 行動…` : '等待下一回合…';
  }

  actionButtons.forEach((button) => {
    const action = button.dataset.action;
    let available = ACTIVE_ACTIONS.has(action);
    if ((action === 'sabotage' || action === 'help') && room.players.length < 2) available = false;
    button.disabled = !(available && isMyTurn && !game.showcaseUntil && !game.transitionUntil);
  });

  if (actionHintEl) actionHintEl.textContent = '';
  gameEventEl.textContent = game.lastEvent?.text || '人生旅程進行中…';

  if (finished) {
    renderResults(room);
  } else if (gameResultsEl) {
    gameResultsEl.classList.add('hidden');
  }

  renderAcceleration(room);
  updateCountdown();
}

function updateCountdown() {
  if (!currentRoom?.game || currentRoom.phase !== 'game' || !currentRoom.game.deadline) {
    turnTimerEl.textContent = '--';
    return;
  }

  const remainingMs = Math.max(0, Number(currentRoom.game.deadline) - serverNow());
  turnTimerEl.textContent = String(Math.ceil(remainingMs / 1000));
}

function chooseProfession(professionId) {
  if (currentRoom?.phase !== 'profession') return;

  setProfessionMessage('');
  socket.emit('room:chooseProfession', { profession: professionId }, (result) => {
    if (!result?.ok) {
      setProfessionMessage(result?.message || '目前無法選擇這個職業。', 'error');
      return;
    }
    applyRoomView(result.room);
  });
}

function submitGameAction(action) {
  if (!currentRoom?.game || currentRoom.phase !== 'game') return;

  socket.emit('game:action', {
    action,
    turnId: currentRoom.game.turnId,
  }, (result) => {
    if (!result?.ok) {
      gameEventEl.textContent = result?.message || '目前無法完成這個行動。';
      if (result?.room) applyRoomView(result.room);
      return;
    }
    applyRoomView(result.room);
  });
}

function withBusy(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  Promise.resolve(task()).finally(() => {
    if (currentRoom && currentRoom.phase === 'lobby') renderRoom(currentRoom);
  });
}

function tryResumeSession() {
  const stored = getStoredSession();
  if (!stored || !socket.connected || resumeInFlight) return;
  if (lastResumeSocketId === socket.id) return;

  lastResumeSocketId = socket.id;
  resumeInFlight = true;
  socket.emit('room:resume', stored, (result) => {
    resumeInFlight = false;
    if (!result?.ok) {
      clearSession();
      showEntry('上一局已結束或伺服器已重新啟動，請重新加入。', 'error');
      return;
    }

    saveSession(result.session);
    applyRoomView(result.room);
  });
}

socket.on('connect', () => {
  lastResumeSocketId = null;
  setTimeout(tryResumeSession, 0);
});

socket.on('server:ready', () => {
  tryResumeSession();
});

socket.on('room:update', (room) => {
  if (currentRoom && room.code === currentRoom.code) applyRoomView(room);
});

socket.on('room:started', (room) => {
  if (currentRoom && room.code === currentRoom.code) applyRoomView(room);
});

joinGameBtn.addEventListener('click', () => {
  const name = getPlayerName();
  setMessage('');

  if (!name) {
    setMessage('請輸入暱稱', 'error');
    playerNameInput.focus();
    return;
  }

  localStorage.setItem(SESSION_KEYS.playerName, name);
  withBusy(joinGameBtn, () => new Promise((resolve) => {
    socket.emit('room:autoJoin', { name }, (result) => {
      if (!result?.ok) {
        setMessage(result?.message || '加入遊戲失敗。', 'error');
        resolve();
        return;
      }

      saveSession(result.session);
      showLobby(result.room);
      resolve();
    });
  }));
});

startGameBtn.addEventListener('click', () => {
  if (!currentRoom || myPlayerId !== currentRoom.hostId) return;

  if (currentRoom.players.length < 2) {
    setLaunchMessage('至少需要2位玩家才能啟程。', 'error');
    return;
  }

  withBusy(startGameBtn, () => new Promise((resolve) => {
    setLaunchMessage('');
    socket.emit('room:start', (result) => {
      if (!result?.ok) {
        setLaunchMessage(result?.message || '目前無法啟程。', 'error');
        renderRoom(currentRoom);
        resolve();
        return;
      }
      applyRoomView(result.room);
      resolve();
    });
  }));
});

playerNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinGameBtn.click();
});

leaveRoomBtn.addEventListener('click', () => {
  socket.emit('room:leave', () => {
    clearSession();
    showEntry();
  });
});

if (leaveGameBtn) {
  leaveGameBtn.addEventListener('click', () => {
    socket.emit('room:leave', () => {
      clearSession();
      showEntry();
    });
  });
}

if (restartGameBtn) {
  restartGameBtn.addEventListener('click', () => {
    if (!currentRoom || myPlayerId !== currentRoom.hostId) return;
    restartGameBtn.disabled = true;
    socket.emit('game:restart', (result) => {
      if (!result?.ok) {
        restartGameBtn.disabled = false;
        gameEventEl.textContent = result?.message || '目前無法重新開始。';
        return;
      }
      applyRoomView(result.room);
    });
  });
}

actionButtons.forEach((button) => {
  button.addEventListener('click', () => submitGameAction(button.dataset.action));
});

setInterval(updateCountdown, 200);

if (socket.connected) setTimeout(tryResumeSession, 0);
