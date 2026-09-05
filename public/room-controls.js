(() => {
  const startBtn = document.getElementById('startGameBtn');
  const rulesBtn = document.getElementById('roomRulesOpenBtn');
  const sharedRulesBtn = document.getElementById('rulesOpenBtn');
  const leaveBtn = document.getElementById('leaveRoomBtn');

  function syncRoomControls(room = (typeof currentRoom !== 'undefined' ? currentRoom : null)) {
    if (!room || room.phase !== 'lobby' || !startBtn) return;
    const mine = typeof myPlayerId !== 'undefined' ? myPlayerId : null;
    const isHost = Boolean(mine && room.hostId === mine);
    const isSoloReady = isHost && Array.isArray(room.players) && room.players.length === 1 && !room.started;
    const canLaunch = isHost && !room.started;

    startBtn.dataset.roomRole = isHost ? 'host' : 'guest';
    startBtn.dataset.playMode = isSoloReady ? 'single' : 'multi';
    startBtn.disabled = !canLaunch;
    startBtn.textContent = '';
    startBtn.setAttribute('aria-label', isSoloReady ? '單人啟程' : (isHost ? '啟程' : '等待中'));
    startBtn.title = isSoloReady ? '單人啟程（自動加入 AI 玩家）' : (isHost ? '啟程' : '等待中');

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

  // app.js 仍保留多人模式的 disabled 計算；若它把單人房主重新鎖住，
  // 只監看 disabled 這一個屬性並立即校正，避免 MutationObserver 自我循環。
  if (startBtn) {
    const observer = new MutationObserver(() => {
      const room = typeof currentRoom !== 'undefined' ? currentRoom : null;
      const mine = typeof myPlayerId !== 'undefined' ? myPlayerId : null;
      const shouldEnable = Boolean(
        room?.phase === 'lobby'
        && room?.hostId === mine
        && Array.isArray(room?.players)
        && room.players.length === 1
        && !room.started
      );
      if (shouldEnable && startBtn.disabled) startBtn.disabled = false;
    });
    observer.observe(startBtn, { attributes: true, attributeFilter: ['disabled'] });
  }

  window.addEventListener('pageshow', () => requestAnimationFrame(() => {
    try { syncRoomControls(); } catch (_) {}
  }));
})();
