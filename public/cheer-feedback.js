(() => {
  const CHEER_SRC = '/music/cheer.mp3';
  const SHOWCASE_MS = 8000;
  const RESULT_MS = 3500;
  const POSITIVE_FATE_INDEXES = new Set([0, 2, 4, 6, 7]);

  const cheer = new Audio(CHEER_SRC);
  cheer.preload = 'auto';
  cheer.volume = 0.8;

  let lastEventKey = '';
  let lastFinishKey = '';
  let pendingTimer = null;
  let unlocked = false;

  function primeAudio() {
    if (unlocked) return;
    const previousVolume = cheer.volume;
    cheer.volume = 0;
    cheer.currentTime = 0;
    const attempt = cheer.play();
    if (attempt && typeof attempt.then === 'function') {
      attempt.then(() => {
        cheer.pause();
        cheer.currentTime = 0;
        cheer.volume = previousVolume;
        unlocked = true;
        removePrimeListeners();
      }).catch(() => {
        cheer.volume = previousVolume;
      });
    } else {
      cheer.volume = previousVolume;
    }
  }

  function removePrimeListeners() {
    document.removeEventListener('pointerdown', primeAudio, true);
    document.removeEventListener('touchstart', primeAudio, true);
    document.removeEventListener('keydown', primeAudio, true);
  }

  function playCheer() {
    if (document.hidden) return;
    try {
      cheer.pause();
      cheer.currentTime = 0;
      const attempt = cheer.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    } catch (_) {
      // Some browsers still require a user gesture before audible playback.
    }
  }

  function isCheerEvent(event) {
    if (!event) return false;
    if (event.type === 'help') return true;
    if (event.type !== 'fate') return false;
    return POSITIVE_FATE_INDEXES.has(Number(event.fateIndex));
  }

  function scheduleEventCheer(room) {
    const game = room?.game;
    const event = game?.lastEvent;
    const showcaseUntil = Number(game?.showcaseUntil || 0);
    const now = Number(room?.serverTime || Date.now());

    if (!game || !event || !game.turnId || !isCheerEvent(event) || showcaseUntil <= now) return;

    const key = `${room.code || ''}:${game.turnId}:${event.type}:${event.fateIndex ?? ''}`;
    if (key === lastEventKey) return;
    lastEventKey = key;

    if (pendingTimer) clearTimeout(pendingTimer);

    // The action showcase reveals the final result during its last RESULT_MS.
    const resultStartsAt = showcaseUntil - RESULT_MS;
    const delay = Math.max(0, resultStartsAt - now);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      playCheer();
    }, delay);
  }

  function playFinishCheer(room) {
    const rankings = room?.game?.results?.rankings;
    if (room?.phase !== 'finished' || !Array.isArray(rankings) || !rankings.length) return;

    const winners = rankings
      .filter((entry) => Number(entry.rank) === 1)
      .map((entry) => entry.playerId || entry.name)
      .join(',');
    const key = `${room.code || ''}:finished:${winners}`;
    if (key === lastFinishKey) return;
    lastFinishKey = key;

    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    playCheer();
  }

  function handleRoomUpdate(room) {
    if (!room) return;
    playFinishCheer(room);
    if (room.phase !== 'finished') scheduleEventCheer(room);
  }

  document.addEventListener('pointerdown', primeAudio, true);
  document.addEventListener('touchstart', primeAudio, true);
  document.addEventListener('keydown', primeAudio, true);

  socket.on('room:update', handleRoomUpdate);
})();
