const socket = io();

const entryPanel = document.getElementById('entryPanel');
const roomPanel = document.getElementById('roomPanel');
const playerNameInput = document.getElementById('playerName');
const joinGameBtn = document.getElementById('joinGameBtn');
const startGameBtn = document.getElementById('startGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const messageEl = document.getElementById('message');
const launchMessageEl = document.getElementById('launchMessage');
const playerCountEl = document.getElementById('playerCount');
const playerListEl = document.getElementById('playerList');

let currentRoom = null;

function setMessage(text, type = '') {
  messageEl.textContent = text || '';
  messageEl.className = `message ${type}`.trim();
}

function setLaunchMessage(text, type = '') {
  launchMessageEl.textContent = text || '';
  launchMessageEl.className = `launch-message ${type}`.trim();
}

function getPlayerName() {
  return playerNameInput.value.trim();
}

function showEntry() {
  currentRoom = null;
  entryPanel.classList.remove('hidden');
  roomPanel.classList.add('hidden');
  setMessage('');
  setLaunchMessage('');
}

function showRoom(room) {
  currentRoom = room;
  entryPanel.classList.add('hidden');
  roomPanel.classList.remove('hidden');
  renderRoom(room);
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

  if (room.started) {
    startGameBtn.textContent = '已啟程';
    setLaunchMessage('遊戲開始！');
  } else if (!isHost) {
    startGameBtn.textContent = '等待房主啟程';
    setLaunchMessage('');
  } else {
    startGameBtn.textContent = '啟程';
    setLaunchMessage('');
  }
}

function withBusy(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  Promise.resolve(task()).finally(() => {
    if (button !== startGameBtn || !currentRoom?.started) {
      renderRoom(currentRoom);
    }
  });
}

socket.on('server:ready', (payload) => {
  console.log(payload);
});

socket.on('room:update', (room) => {
  if (currentRoom && room.code === currentRoom.code) {
    renderRoom(room);
  }
});

socket.on('room:started', (room) => {
  if (currentRoom && room.code === currentRoom.code) {
    renderRoom(room);
  }
});

joinGameBtn.addEventListener('click', () => {
  withBusy(joinGameBtn, () => new Promise((resolve) => {
    const name = getPlayerName();
    setMessage('');

    socket.emit('room:autoJoin', { name }, (result) => {
      if (!result?.ok) {
        setMessage(result?.message || '加入遊戲失敗。', 'error');
        resolve();
        return;
      }

      showRoom(result.room);
      resolve();
    });
  }));
});

startGameBtn.addEventListener('click', () => {
  withBusy(startGameBtn, () => new Promise((resolve) => {
    setLaunchMessage('');

    socket.emit('room:start', (result) => {
      if (!result?.ok) {
        setLaunchMessage(result?.message || '目前無法啟程。', 'error');
        renderRoom(currentRoom);
        resolve();
        return;
      }

      renderRoom(result.room);
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
