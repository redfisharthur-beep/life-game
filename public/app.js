const socket = io();

const entryPanel = document.getElementById('entryPanel');
const roomPanel = document.getElementById('roomPanel');
const playerNameInput = document.getElementById('playerName');
const joinGameBtn = document.getElementById('joinGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const messageEl = document.getElementById('message');
const playerCountEl = document.getElementById('playerCount');
const playerListEl = document.getElementById('playerList');
const roomNoticeEl = document.getElementById('roomNotice');

let currentRoom = null;

function setMessage(text, type = '') {
  messageEl.textContent = text || '';
  messageEl.className = `message ${type}`.trim();
}

function getPlayerName() {
  return playerNameInput.value.trim();
}

function showEntry() {
  currentRoom = null;
  entryPanel.classList.remove('hidden');
  roomPanel.classList.add('hidden');
  setMessage('');
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

  if (room.players.length < 2) {
    roomNoticeEl.textContent = '等待其他玩家加入…';
  } else if (room.players.length < 6) {
    roomNoticeEl.textContent = '已有玩家加入，等待更多玩家…';
  } else {
    roomNoticeEl.textContent = '房間已滿6人。';
  }
}

function withBusy(button, task) {
  if (button.disabled) return;
  button.disabled = true;
  Promise.resolve(task()).finally(() => {
    button.disabled = false;
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
