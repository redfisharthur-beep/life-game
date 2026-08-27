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
  room.players.forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'player-row';

    const number = document.createElement('span');
    number.className = 'player-number';
    number.textContent = index + 1;

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

    row.append(number, name, badge);
    playerListEl.appendChild(row);
  });

  const canStart = room.players.length >= 2 && !room.started;
  startGameBtn.disabled = !canStart;
  startGameBtn.textContent = room.started ? '已啟程' : '啟程';

  if (room.started) {
    setLaunchMessage('準備進入下一階段…');
  } else {
    setLaunchMessage('');
  }
}

function withBusy(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  Promise.resolve(task()).finally(() => {
    if (button !== startGameBtn || !currentRoom?.started) {
      button.disabled = false;
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
