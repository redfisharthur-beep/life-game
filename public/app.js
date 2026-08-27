const socket = io();

const statusEl = document.getElementById('status');
const entryPanel = document.getElementById('entryPanel');
const roomPanel = document.getElementById('roomPanel');
const playerNameInput = document.getElementById('playerName');
const roomCodeInput = document.getElementById('roomCodeInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const messageEl = document.getElementById('message');
const roomCodeEl = document.getElementById('roomCode');
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
  roomCodeEl.textContent = room.code;
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
    roomNoticeEl.textContent = '等待至少1位朋友加入…';
  } else if (room.players.length < 6) {
    roomNoticeEl.textContent = '房間已成立，下一階段會加入職業選擇。';
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

socket.on('connect', () => {
  statusEl.textContent = '伺服器連線正常';
  statusEl.classList.add('ok');
});

socket.on('server:ready', (payload) => {
  console.log(payload);
});

socket.on('room:update', (room) => {
  if (currentRoom && room.code === currentRoom.code) {
    renderRoom(room);
  }
});

socket.on('disconnect', () => {
  statusEl.textContent = '與伺服器連線中斷，正在重新連線…';
  statusEl.classList.remove('ok');
});

createRoomBtn.addEventListener('click', () => {
  withBusy(createRoomBtn, () => new Promise((resolve) => {
    const name = getPlayerName();
    setMessage('');

    socket.emit('room:create', { name }, (result) => {
      if (!result?.ok) {
        setMessage(result?.message || '建立房間失敗。', 'error');
        resolve();
        return;
      }

      showRoom(result.room);
      resolve();
    });
  }));
});

joinRoomBtn.addEventListener('click', () => {
  withBusy(joinRoomBtn, () => new Promise((resolve) => {
    const name = getPlayerName();
    const code = roomCodeInput.value.replace(/\D/g, '').slice(0, 4);
    roomCodeInput.value = code;
    setMessage('');

    socket.emit('room:join', { name, code }, (result) => {
      if (!result?.ok) {
        setMessage(result?.message || '加入房間失敗。', 'error');
        resolve();
        return;
      }

      showRoom(result.room);
      resolve();
    });
  }));
});

leaveRoomBtn.addEventListener('click', () => {
  socket.emit('room:leave', () => {
    showEntry();
  });
});

roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = roomCodeInput.value.replace(/\D/g, '').slice(0, 4);
});
