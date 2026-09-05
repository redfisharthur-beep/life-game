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

  // app.js 會先依多人規則更新 disabled；這裡在 DOM 更新後再校正一次，
  // 讓只有房主一人的等待室也能直接按「啟程」進入單人模式。
  const observer = new MutationObserver(() => {
    requestAnimationFrame(() => {
      try { syncRoomControls(); } catch (_) {}
    });
  });
  if (startBtn) observer.observe(startBtn, { attributes: true, childList: true, subtree: true });

  window.addEventListener('pageshow', () => requestAnimationFrame(() => {
    try { syncRoomControls(); } catch (_) {}
  }));
})();
