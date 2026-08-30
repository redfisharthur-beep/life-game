(() => {
  const startBtn = document.getElementById('startGameBtn');
  const rulesBtn = document.getElementById('roomRulesOpenBtn');
  const sharedRulesBtn = document.getElementById('rulesOpenBtn');
  const leaveBtn = document.getElementById('leaveRoomBtn');

  function syncRoomControls(room = (typeof currentRoom !== 'undefined' ? currentRoom : null)) {
    if (!room || room.phase !== 'lobby' || !startBtn) return;
    const mine = typeof myPlayerId !== 'undefined' ? myPlayerId : null;
    const isHost = Boolean(mine && room.hostId === mine);
    startBtn.dataset.roomRole = isHost ? 'host' : 'guest';
    startBtn.textContent = '';
    startBtn.setAttribute('aria-label', isHost ? '啟程' : '等待中');
    startBtn.title = isHost ? '啟程' : '等待中';

    if (leaveBtn) {
      leaveBtn.textContent = '';
      leaveBtn.setAttribute('aria-label', '回到上一頁');
      leaveBtn.title = '回到上一頁';
    }
  }

  if (rulesBtn && sharedRulesBtn) {
    rulesBtn.addEventListener('click', () => sharedRulesBtn.click());
  }

  if (typeof socket !== 'undefined') {
    socket.on('room:update', (room) => requestAnimationFrame(() => syncRoomControls(room)));
    socket.on('room:started', (room) => requestAnimationFrame(() => syncRoomControls(room)));
  }

  window.addEventListener('pageshow', () => requestAnimationFrame(() => {
    try { syncRoomControls(); } catch (_) {}
  }));
})();
