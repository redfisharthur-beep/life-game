(() => {
  const audio = new Audio('/music/homepage.mp3');
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0.35;

  const entryPanel = document.getElementById('entryPanel');
  const roomPanel = document.getElementById('roomPanel');
  const professionPanel = document.getElementById('professionPanel');
  const gamePanel = document.getElementById('gamePanel');

  let unlocked = false;

  function isHomepageVisible() {
    if (!entryPanel) return false;
    return !entryPanel.classList.contains('hidden')
      && roomPanel?.classList.contains('hidden')
      && professionPanel?.classList.contains('hidden')
      && gamePanel?.classList.contains('hidden');
  }

  async function playHomepageMusic() {
    if (!isHomepageVisible()) return;
    try {
      await audio.play();
      unlocked = true;
    } catch (_) {
      // Browser autoplay policy may block sound until the first user gesture.
    }
  }

  function stopHomepageMusic() {
    if (audio.paused) return;
    audio.pause();
    audio.currentTime = 0;
  }

  function syncMusic() {
    if (isHomepageVisible()) {
      playHomepageMusic();
    } else {
      stopHomepageMusic();
    }
  }

  function unlockFromGesture() {
    if (!isHomepageVisible()) return;
    playHomepageMusic();
    if (unlocked) removeUnlockListeners();
  }

  function removeUnlockListeners() {
    document.removeEventListener('pointerdown', unlockFromGesture, true);
    document.removeEventListener('keydown', unlockFromGesture, true);
    document.removeEventListener('touchstart', unlockFromGesture, true);
  }

  document.addEventListener('pointerdown', unlockFromGesture, true);
  document.addEventListener('keydown', unlockFromGesture, true);
  document.addEventListener('touchstart', unlockFromGesture, true);

  [entryPanel, roomPanel, professionPanel, gamePanel].filter(Boolean).forEach((panel) => {
    new MutationObserver(syncMusic).observe(panel, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  window.addEventListener('pageshow', syncMusic);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      audio.pause();
    } else {
      syncMusic();
    }
  });

  syncMusic();
})();
