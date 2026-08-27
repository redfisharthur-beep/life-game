const socket = io();

const entryPanel = document.getElementById('entryPanel');
const roomPanel = document.getElementById('roomPanel');
const professionPanel = document.getElementById('professionPanel');
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

const PROFESSIONS = [
  {
    id: 'doctor',
    name: '醫師',
    image: '/images/doctor.png',
    stats: ['薪資 7', '選股 ×1.5', '圈地 ×2.0', '圓夢 ×2.35'],
  },
  {
    id: 'engineer',
    name: '工程師',
    image: '/images/engineer.png',
    stats: ['薪資 8', '選股 ×2.0', '圈地 ×1.0', '圓夢 ×2.10'],
  },
  {
    id: 'sales',
    name: '超業',
    image: '/images/sales.png',
    stats: ['薪資 9', '選股 ×1.5', '圈地 ×1.5', '圓夢 ×1.95'],
  },
  {
    id: 'office',
    name: '白領',
    image: '/images/office.png',
    stats: ['薪資 5', '選股 ×2.0', '圈地 ×1.0', '圓夢 ×2.975'],
  },
  {
    id: 'athlete',
    name: '運動員',
    image: '/images/athlete.png',
    stats: ['薪資 6', '選股 ×1.0', '圈地 ×1.5', '圓夢 ×2.70'],
  },
  {
    id: 'rich',
    name: '富二代',
    image: '/images/rich.png',
    stats: ['薪資 10', '選股 ×1.0', '圈地 ×2.0', '圓夢 ×1.80'],
  },
];

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

function showEntry() {
  currentRoom = null;
  entryPanel.classList.remove('hidden');
  roomPanel.classList.add('hidden');
  professionPanel.classList.add('hidden');
  setMessage('');
  setLaunchMessage('');
  setProfessionMessage('');
}

function showLobby(room) {
  currentRoom = room;
  entryPanel.classList.add('hidden');
  roomPanel.classList.remove('hidden');
  professionPanel.classList.add('hidden');
  renderRoom(room);
}

function showProfession(room) {
  currentRoom = room;
  entryPanel.classList.add('hidden');
  roomPanel.classList.add('hidden');
  professionPanel.classList.remove('hidden');
  renderProfessions(room);
}

function applyRoomView(room) {
  if (!room) return;
  currentRoom = room;

  if (room.started || room.phase === 'profession') {
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

  if (!isHost) {
    startGameBtn.textContent = '等待房主啟程';
  } else {
    startGameBtn.textContent = '啟程';
  }

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

    const image = document.createElement('img');
    image.className = 'profession-image';
    image.src = profession.image;
    image.alt = profession.name;

    const name = document.createElement('span');
    name.className = 'profession-name';
    name.textContent = profession.name;

    const stats = document.createElement('span');
    stats.className = 'profession-stats';
    stats.innerHTML = profession.stats.map((item) => `<span>${item}</span>`).join('');

    const state = document.createElement('span');
    state.className = 'profession-state';

    if (selectedByMe) {
      state.textContent = '你的選擇';
    } else if (takenByOther) {
      state.textContent = `${selectedBy.name} 已選`;
    } else {
      state.textContent = '選擇';
    }

    button.append(image, name, stats, state);

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

function chooseProfession(professionId) {
  if (!currentRoom?.started) return;

  setProfessionMessage('');

  socket.emit('room:chooseProfession', { profession: professionId }, (result) => {
    if (!result?.ok) {
      setProfessionMessage(result?.message || '目前無法選擇這個職業。', 'error');
      return;
    }

    applyRoomView(result.room);
  });
}

function withBusy(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  Promise.resolve(task()).finally(() => {
    if (currentRoom && !currentRoom.started) {
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
