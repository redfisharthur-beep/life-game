(() => {
  const FRAME_MS = 85;
  const ROLL_MS = 1500;

  let activeImage = null;
  let rollInterval = null;
  let settleTimer = null;
  let animationToken = 0;

  function clearAnimation() {
    animationToken += 1;
    if (rollInterval) {
      clearInterval(rollInterval);
      rollInterval = null;
    }
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    if (activeImage) {
      activeImage.classList.remove('dice-rolling', 'dice-landed');
      delete activeImage.dataset.diceAnimating;
    }
    activeImage = null;
  }

  function randomSingleImage() {
    return `/images/${1 + Math.floor(Math.random() * 6)}.png`;
  }

  function randomDoubleImage() {
    return `/images/2-${2 + Math.floor(Math.random() * 11)}.png`;
  }

  function startAnimation(image) {
    if (!image || image.dataset.diceAnimating === '1') return;

    clearAnimation();
    activeImage = image;
    image.dataset.diceAnimating = '1';

    const token = animationToken;
    const finalSrc = image.getAttribute('src') || '/images/dice.png';
    const container = image.closest('.dice-result-images');
    const isDouble = Boolean(container?.classList.contains('double-dice-total'));
    const nextFrame = isDouble ? randomDoubleImage : randomSingleImage;

    image.classList.remove('dice-landed');
    image.classList.add('dice-rolling');
    image.src = nextFrame();

    rollInterval = setInterval(() => {
      if (token !== animationToken || !image.isConnected) return;
      image.src = nextFrame();
    }, FRAME_MS);

    settleTimer = setTimeout(() => {
      if (token !== animationToken || !image.isConnected) return;
      if (rollInterval) {
        clearInterval(rollInterval);
        rollInterval = null;
      }
      image.src = finalSrc;
      image.classList.remove('dice-rolling');
      image.classList.add('dice-landed');
    }, ROLL_MS);
  }

  function syncDiceAnimation() {
    const overlay = document.querySelector('.action-showcase');
    const isDiceStage = Boolean(
      overlay
      && !overlay.classList.contains('hidden')
      && overlay.classList.contains('dice-stage-active')
    );

    if (!isDiceStage) {
      if (activeImage) clearAnimation();
      return;
    }

    const image = overlay.querySelector('.dice-result-image');
    if (!image) return;
    if (image !== activeImage || image.dataset.diceAnimating !== '1') {
      startAnimation(image);
    }
  }

  const observer = new MutationObserver(syncDiceAnimation);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  window.addEventListener('pageshow', syncDiceAnimation);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearAnimation();
    else syncDiceAnimation();
  });

  syncDiceAnimation();
})();
