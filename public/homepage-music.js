(() => {
  const tracks = {
    homepage: new Audio('/music/homepage.mp3'),
    lobby: new Audio('/music/lobby.mp3'),
    game: new Audio('/music/game.mp3'),
  };

  Object.values(tracks).forEach((audio) => {
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.35;
  });
  tracks.game.volume = 0.20;

  const entryPanel = document.getElementById('entryPanel');
  const roomPanel = document.getElementById('roomPanel');
  const professionPanel = document.getElementById('professionPanel');
  const gamePanel = document.getElementById('gamePanel');
  const gameResults = document.getElementById('gameResults');

  let activeTrack = null;
  let unlocked = false;

  function isVisible(panel) {
    return Boolean(panel) && !panel.classList.contains('hidden');
  }

  function desiredTrack() {
    if (isVisible(gamePanel)) {
      return isVisible(gameResults) ? null : 'game';
    }
    if (isVisible(roomPanel) || isVisible(professionPanel)) return 'lobby';
    if (isVisible(entryPanel)) return 'homepage';
    return null;
  }

  function stopTrack(name, reset = true) {
    const audio = tracks[name];
    if (!audio) return;
    audio.pause();
    if (reset) audio.currentTime = 0;
  }

  function stopAll(except = null) {
    Object.keys(tracks).forEach((name) => {
      if (name !== except) stopTrack(name, true);
    });
  }

  async function playTrack(name) {
    const audio = tracks[name];
    if (!audio) return;

    stopAll(name);
    activeTrack = name;

    try {
      await audio.play();
      unlocked = true;
    } catch (_) {
      // Browsers may block audible autoplay until the first user gesture.
    }
  }

  function syncMusic() {
    const wanted = desiredTrack();

    if (!wanted) {
      stopAll();
      activeTrack = null;
      return;
    }

    if (activeTrack === wanted && !tracks[wanted].paused) return;
    playTrack(wanted);
  }

  function unlockFromGesture() {
    const wanted = desiredTrack();
    if (!wanted) return;

    playTrack(wanted).then(() => {
      if (unlocked) removeUnlockListeners();
    });
  }

  function removeUnlockListeners() {
    document.removeEventListener('pointerdown', unlockFromGesture, true);
    document.removeEventListener('keydown', unlockFromGesture, true);
    document.removeEventListener('touchstart', unlockFromGesture, true);
  }

  document.addEventListener('pointerdown', unlockFromGesture, true);
  document.addEventListener('keydown', unlockFromGesture, true);
  document.addEventListener('touchstart', unlockFromGesture, true);

  [entryPanel, roomPanel, professionPanel, gamePanel, gameResults].filter(Boolean).forEach((panel) => {
    new MutationObserver(syncMusic).observe(panel, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  window.addEventListener('pageshow', syncMusic);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Object.values(tracks).forEach((audio) => audio.pause());
    } else {
      syncMusic();
    }
  });

  syncMusic();
})();
