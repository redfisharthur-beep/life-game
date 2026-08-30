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
  {
    id: 'civilServant',
    name: '公務員',
    image: '/images/civil%20servant.png',
    abilities: [
      { label: '薪資', grade: 'B' },
      { label: '選股', grade: 'A' },
      { label: '圈地', grade: 'A' },
      { label: '圓夢', grade: 'A' },
    ],
  },
  {
    id: 'artist',
    name: '藝人',
    image: '/images/artist.png',
    abilities: [
      { label: '薪資', grade: 'A' },
      { label: '選股', grade: 'B' },
      { label: '圈地', grade: 'C' },
      { label: '圓夢', grade: 'S' },
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

function getSavedSession() {
  const roomCode = localStorage.getItem(SESSION_KEYS.roomCode);
  const playerId = localStorage.getItem(SESSION_KEYS.playerId);
  const reconnectToken = localStorage.getItem(SESSION_KEYS.reconnectToken);
  if (!roomCode || !playerId || !reconnectToken) return null;
  return { roomCode, playerId, reconnectToken };
}

function showPanel(panel) {
  [entryPanel, roomPanel, professionPanel, gamePanel].forEach((candidate) => {
    candidate.classList.toggle('hidden', candidate !== panel);
  });
}

function updateServerState(room) {
  if (!room) return;
  updateServerClock(room);
  currentRoom = room;
  const lobbyCard = document.getElementById('lobbyCard');
  if (room.phase === 'game' || room.phase === 'finished') {
    lobbyCard?.classList.add('game-mode');
  } else {
    lobbyCard?.classList.remove('game-mode');
  }
}

function renderRoom(room) {
  if (!room) return;
  updateServerState(room);
  playerCountEl.textContent = `${room.players.length} / ${room.maxPlayers}`;
  playerListEl.innerHTML = '';

  room.players.forEach((player) => {
    const row = document.createElement('li');
    row.className = 'player-row';
    if (player.id === myPlayerId) row.classList.add('me');

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
  const shouldShow = room?.phase === 'game'
    && Number(room?.game?.round || 0) === 16
    && Number(room?.game?.transitionUntil || 0) > serverNow();

  roundAnnouncementEl.classList.toggle('hidden', !shouldShow);
  if (shouldShow) roundAnnouncementEl.textContent = '人生加速！從現在開始每回合擲2顆骰子！';
}

function renderGame(room) {
  if (!room?.game) return;
  updateServerState(room);
  const game = room.game;
  const me = room.players.find((player) => player.id === myPlayerId);

  stageNameEl.textContent = game.stageName || '';
  roundLabelEl.textContent = `${game.round} / ${game.totalRounds}`;
  stockPriceEl.textContent = Number(game.stockPrice || 0).toFixed(2);
  landPriceEl.textContent = Number(game.landPrice || 0).toFixed(2);
  myNameEl.textContent = me?.name || '';
  myProfessionEl.textContent = PROFESSION_BY_ID[me?.profession]?.name || '';
  myCashEl.textContent = formatAsset(me?.cash);
  myStocksEl.textContent = formatAsset(me?.stocks);
  myLandEl.textContent = formatAsset(me?.land);
  myHappinessEl.textContent = Number(me?.happiness || 0).toFixed(2);

  const currentPlayer = room.players.find((player) => player.id === game.currentPlayerId);
  const myTurn = game.currentPlayerId === myPlayerId && room.phase === 'game';
  const busy = Number(game.showcaseUntil || 0) > serverNow()
    || Number(game.transitionUntil || 0) > serverNow()
    || Number(game.majorEventUntil || 0) > serverNow();

  actionButtons.forEach((button) => {
    const action = button.dataset.action;
    button.disabled = !myTurn || busy || !ACTIVE_ACTIONS.has(action);
  });

  if (room.phase === 'finished') {
    turnNoticeEl.textContent = '人生旅程完成';
    turnTimerEl.textContent = '0';
  } else if (busy) {
    turnNoticeEl.textContent = '結果揭曉中…';
  } else if (myTurn) {
    turnNoticeEl.textContent = '輪到你行動！';
  } else {
    turnNoticeEl.textContent = currentPlayer ? `等待 ${currentPlayer.name} 行動…` : '準備下一回合…';
  }

  turnOrderEl.innerHTML = '';
  (game.turnOrder || []).forEach((playerId, index) => {
    const player = room.players.find((item) => item.id === playerId);
    if (!player) return;
    const item = document.createElement('span');
    item.textContent = player.name;
    if (index === game.turnIndex) item.classList.add('active');
    turnOrderEl.appendChild(item);
  });

  const event = game.lastEvent;
  gameEventEl.textContent = event?.text || '';
  renderResults(room);
  renderAcceleration(room);
}

function renderByPhase(room) {
  if (!room) return;
  if (room.phase === 'lobby') {
    showPanel(roomPanel);
    renderRoom(room);
  } else if (room.phase === 'profession') {
    showPanel(professionPanel);
    renderProfessions(room);
  } else if (room.phase === 'game' || room.phase === 'finished') {
    showPanel(gamePanel);
    renderGame(room);
  }
}

async function joinGame() {
  const name = playerNameInput.value.trim();
  if (!name) {
    setMessage('請先輸入名字', 'error');
    return;
  }

  joinGameBtn.disabled = true;
  setMessage('正在尋找人生夥伴…');

  socket.emit('room:autoJoin', { name }, (result) => {
    joinGameBtn.disabled = false;
    if (!result?.ok) {
      setMessage(result?.message || '加入失敗，請稍後再試', 'error');
      return;
    }
    saveSession(result.session);
    setMessage('');
    renderByPhase(result.room);
  });
}

function startGame() {
  startGameBtn.disabled = true;
  socket.emit('room:start', {}, (result) => {
    if (!result?.ok) {
      startGameBtn.disabled = false;
      setLaunchMessage(result?.message || '無法啟程', 'error');
      return;
    }
    setLaunchMessage('');
    renderByPhase(result.room);
  });
}

function chooseProfession(profession) {
  socket.emit('room:chooseProfession', { profession }, (result) => {
    if (!result?.ok) {
      setProfessionMessage(result?.message || '選擇職業失敗', 'error');
      return;
    }
    renderByPhase(result.room);
  });
}

function performAction(action) {
  if (!currentRoom?.game?.turnId) return;
  socket.emit('game:action', { action, turnId: currentRoom.game.turnId }, (result) => {
    if (!result?.ok) {
      if (result?.message) gameEventEl.textContent = result.message;
      return;
    }
    renderByPhase(result.room);
  });
}

function restartGame() {
  socket.emit('game:restart', {}, (result) => {
    if (!result?.ok) {
      if (result?.message) gameEventEl.textContent = result.message;
      return;
    }
    renderByPhase(result.room);
  });
}

function leaveRoom() {
  socket.emit('room:leave', {}, () => {
    clearSession();
    currentRoom = null;
    showPanel(entryPanel);
    setMessage('已離開房間');
  });
}

function tryResume() {
  if (resumeInFlight) return;
  const session = getSavedSession();
  if (!session) return;
  resumeInFlight = true;

  socket.emit('room:resume', session, (result) => {
    resumeInFlight = false;
    if (!result?.ok) {
      clearSession();
      showPanel(entryPanel);
      return;
    }
    saveSession(result.session || { ...session, name: localStorage.getItem(SESSION_KEYS.playerName) });
    renderByPhase(result.room);
  });
}

joinGameBtn.addEventListener('click', joinGame);
playerNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinGame();
});
startGameBtn.addEventListener('click', startGame);
leaveRoomBtn.addEventListener('click', leaveRoom);
restartGameBtn?.addEventListener('click', restartGame);
leaveGameBtn?.addEventListener('click', leaveRoom);
actionButtons.forEach((button) => {
  button.addEventListener('click', () => performAction(button.dataset.action));
});

socket.on('connect', () => {
  if (socket.id === lastResumeSocketId) return;
  lastResumeSocketId = socket.id;
  tryResume();
});

socket.on('room:update', (room) => renderByPhase(room));
socket.on('room:started', (room) => renderByPhase(room));

setInterval(() => {
  if (!currentRoom?.game || currentRoom.phase !== 'game') return;
  const deadline = Number(currentRoom.game.deadline || 0);
  const remaining = Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
  turnTimerEl.textContent = String(remaining);
  renderAcceleration(currentRoom);
}, 250);

showPanel(entryPanel);
if (socket.connected) tryResume();
