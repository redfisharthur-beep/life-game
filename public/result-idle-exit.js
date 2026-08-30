(() => {
  const resultsPanel = document.getElementById('gameResults');
  if (!resultsPanel || typeof socket === 'undefined') return;

  const IDLE_MS = 60_000;
  const activityEvents = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
  let idleTimer = null;
  let leaving = false;

  function resultsVisible() {
    return !resultsPanel.classList.contains('hidden');
  }

  function clearIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function goHome() {
    if (leaving || !resultsVisible()) return;
    leaving = true;
    clearIdleTimer();

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

  function armIdleTimer() {
    clearIdleTimer();
    if (!resultsVisible() || leaving) return;
    idleTimer = setTimeout(goHome, IDLE_MS);
  }

  function onActivity() {
    if (!resultsVisible() || leaving) return;
    armIdleTimer();
  }

  activityEvents.forEach((eventName) => {
    document.addEventListener(eventName, onActivity, {
      capture: true,
      passive: true,
    });
  });

  new MutationObserver(() => {
    if (resultsVisible()) {
      leaving = false;
      armIdleTimer();
    } else {
      clearIdleTimer();
      leaving = false;
    }
  }).observe(resultsPanel, {
    attributes: true,
    attributeFilter: ['class'],
  });

  if (resultsVisible()) armIdleTimer();
})();
