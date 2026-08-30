(() => {
  const resultsPanel = document.getElementById('gameResults');
  if (!resultsPanel || typeof socket === 'undefined') return;

  const RESULTS_STAY_MS = 180_000;
  let exitTimer = null;
  let leaving = false;

  function resultsVisible() {
    return !resultsPanel.classList.contains('hidden');
  }

  function clearExitTimer() {
    if (exitTimer) clearTimeout(exitTimer);
    exitTimer = null;
  }

  function goHome() {
    if (leaving || !resultsVisible()) return;
    leaving = true;
    clearExitTimer();

    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      try {
        if (typeof clearSession === 'function') clearSession();
      } catch (_) {}
      try {
        if (typeof currentRoom !== 'undefined') currentRoom = null;
      } catch (_) {}
      window.location.assign('/');
    };

    try {
      socket.emit('room:leave', {}, finish);
      // 網路異常時也不能永久卡在結算頁。
      setTimeout(finish, 1500);
    } catch (_) {
      finish();
    }
  }

  function armExitTimer() {
    clearExitTimer();
    if (!resultsVisible() || leaving) return;
    // 結算頁最多停留 3 分鐘；玩家操作不延長時間，避免房間被長時間占用。
    exitTimer = setTimeout(goHome, RESULTS_STAY_MS);
  }

  new MutationObserver(() => {
    if (resultsVisible()) {
      leaving = false;
      armExitTimer();
    } else {
      clearExitTimer();
      leaving = false;
    }
  }).observe(resultsPanel, {
    attributes: true,
    attributeFilter: ['class'],
  });

  if (resultsVisible()) armExitTimer();
})();
