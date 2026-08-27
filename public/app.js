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
const actionButtons = [...document.querySelectorAll('.action-button')];

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
    name: '工程師',
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
    name: '超業',
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
    name: '白領',
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
    name: '運動員',
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
    name: '富二代',
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

function getPlayerName() {
  return playerNameInput.value.trim();
}

function hideAllPanels() {
  entryPanel.classList.add('hidden');
  roomPanel.classList.add('hidden');
  professionPanel.classList.add('hidden');
  gamePanel.classList.add('hidden');
}

function showEntry() {
  currentRoom = null;
  hideAllPanels();
  entryPanel.classList.remove('hidden');
  setMessage('');
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

  currentRoom = room;
  playerCountEl.textContent = `${room.players.length} / ${room.maxPlayers}`;

  playerListEl.innerHTML = '';
  room.players.forEach((player) => {
    const row = document.createElement('div');
    row.className = 'player-row';

    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = player.name;

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

  const isHost = socket.id === room.hostId;
  const hasEnoughPlayers = room.players.length >= 2;
  const canStart = isHost && hasEnoughPlayers && !room.started;

  startGameBtn.disabled = !canStart;
  startGameBtn.textContent = isHost ? '啟程' : '等待房主啟程';
  setLaunchMessage('');
}

function renderProfessions(room) {
  if (!room) return;

  currentRoom = room;
  professionGridEl.innerHTML = '';

  const me = room.players.find((player) => player.id === socket.id);

  PROFESSIONS.forEach((profession) => {
    const selectedBy = room.players.find((player) => player.profession === profession.id);
    const selectedByMe = selectedBy?.id === socket.id;
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

    button.addEventListener('click', () => {
      chooseProfession(profession.id);
    });

    professionGridEl.appendChild(button);
  });

  if (room.allReady) {
    setProfessionMessage('全員選擇完成 ✓');
  } else if (me?.profession) {
    setProfessionMessage('已選擇職業，等待其他玩家…');
  } else {
    setProfessionMessage('請選擇你的職業');
  }
}

function renderGame(room) {
  if (!room?.game) return;

  currentRoom = room;
  const game = room.game;
  const me = room.players.find((player) => player.id === socket.id);
  const currentPlayer = room.players.find((player) => player.id === game.currentPlayerId);

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
    if (playerId === socket.id) chip.classList.add('me');
    turnOrderEl.appendChild(chip);
  });

  const isMyTurn = game.currentPlayerId === socket.id && room.phase === 'game' && !game.finished;

  if (room.phase === 'finished' || game.finished) {
    turnNoticeEl.textContent = '30 回合完成';
  } else if (isMyTurn) {
    turnNoticeEl.textContent = '輪到你了！請選擇行動';
  } else {
    turnNoticeEl.textContent = currentPlayer ? `等待 ${currentPlayer.name} 行動…` : '等待下一回合…';
  }

  actionButtons.forEach((button) => {
    const isSalary = button.dataset.action === 'salary';
    button.disabled = !(isSalary && isMyTurn);
  });

  gameEventEl.textContent = game.lastEvent?.text || '人生旅程進行中…';
  updateCountdown();
}

function updateCountdown() {
  if (!currentRoom?.game || currentRoom.phase !== 'game' || !currentRoom.game.deadline) {
    turnTimerEl.textContent = '--';
    return;
  }

  const remainingMs = Math.max(0, currentRoom.game.deadline - Date.now());
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
      return;
    }

    applyRoomView(result.room);
  });
}

function withBusy(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  Promise.resolve(task()).finally(() => {
    if (currentRoom && currentRoom.phase === 'lobby') {
      renderRoom(currentRoom);
    }
  });
}

socket.on('server:ready', (payload) => {
  console.log(payload);
});

socket.on('room:update', (room) => {
  if (currentRoom && room.code === currentRoom.code) {
    applyRoomView(room);
  }
});

socket.on('room:started', (room) => {
  if (currentRoom && room.code === currentRoom.code) {
    applyRoomView(room);
  }
});

joinGameBtn.addEventListener('click', () => {
  const name = getPlayerName();
  setMessage('');

  if (!name) {
    setMessage('請輸入暱稱', 'error');
    playerNameInput.focus();
    return;
  }

  withBusy(joinGameBtn, () => new Promise((resolve) => {
    socket.emit('room:autoJoin', { name }, (result) => {
      if (!result?.ok) {
        setMessage(result?.message || '加入遊戲失敗。', 'error');
        resolve();
        return;
      }

      showLobby(result.room);
      resolve();
    });
  }));
});

startGameBtn.addEventListener('click', () => {
  if (!currentRoom) return;

  const isHost = socket.id === currentRoom.hostId;
  if (!isHost) return;

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
  if (event.key === 'Enter') {
    joinGameBtn.click();
  }
});

leaveRoomBtn.addEventListener('click', () => {
  socket.emit('room:leave', () => {
    showEntry();
  });
});

actionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    submitGameAction(button.dataset.action);
  });
});

setInterval(updateCountdown, 200);
