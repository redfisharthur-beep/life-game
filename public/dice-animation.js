(() => {
  const ROLL_FRAMES = [
    '/images/roll1.png',
    '/images/roll4.png',
    '/images/roll7.png',
    '/images/roll11.png',
  ];
  const FRAME_MS = 375;
  const ROLL_MS = 1500;
  const FINAL_HOLD_MS = 1000;

  let activeImage = null;
  let rollInterval = null;
  let settleTimer = null;
  let holdTimer = null;
  let animationToken = 0;

  function removeFinalHold() {
    document.querySelectorAll('.dice-final-hold-layer').forEach((layer) => layer.remove());
    const overlay = document.querySelector('.action-showcase');
    overlay?.classList.remove('dice-final-hold-active');
  }

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
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    removeFinalHold();
    if (activeImage) {
      activeImage.classList.remove('dice-rolling', 'dice-landed');
      delete activeImage.dataset.diceAnimating;
    }
    activeImage = null;
  }

  function showFinalHold(finalSrc, finalAlt) {
    const overlay = document.querySelector('.action-showcase');
    const card = overlay?.querySelector('.action-showcase-card');
    if (!overlay || !card) return;

    removeFinalHold();
    overlay.classList.add('dice-final-hold-active');

    const layer = document.createElement('div');
    layer.className = 'dice-final-hold-layer';
    layer.setAttribute('aria-label', finalAlt);
    layer.innerHTML = `<img class="dice-final-hold-image" src="${finalSrc}" alt="${finalAlt}" />`;
    card.appendChild(layer);

    holdTimer = setTimeout(() => {
      layer.remove();
      overlay.classList.remove('dice-final-hold-active');
      holdTimer = null;
    }, FINAL_HOLD_MS);
  }

  function startAnimation(image) {
    if (!image || image.dataset.diceAnimating === '1') return;

    clearAnimation();
    activeImage = image;
    image.dataset.diceAnimating = '1';

    const token = animationToken;
    const finalSrc = image.getAttribute('src') || '/images/dice.png';
    const finalAlt = image.getAttribute('alt') || '骰子結果';
    let frameIndex = 0;

    image.classList.remove('dice-landed');
    image.classList.add('dice-rolling');
    image.src = ROLL_FRAMES[0];

    rollInterval = setInterval(() => {
      if (token !== animationToken || !image.isConnected) return;
      frameIndex += 1;
      if (frameIndex >= ROLL_FRAMES.length) {
        clearInterval(rollInterval);
        rollInterval = null;
        frameIndex = ROLL_FRAMES.length - 1;
      }
      image.src = ROLL_FRAMES[frameIndex];
    }, FRAME_MS);

    settleTimer = setTimeout(() => {
      if (token !== animationToken || !image.isConnected) return;
      if (rollInterval) {
        clearInterval(rollInterval);
        rollInterval = null;
      }

      image.src = finalSrc;
      image.alt = finalAlt;
      image.classList.remove('dice-rolling');
      image.classList.add('dice-landed');

      // 1.5 秒只播放 roll1 / roll4 / roll7 / roll11，最後結果完整定格 1 秒。
      showFinalHold(finalSrc, finalAlt);
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
      if (activeImage && !holdTimer) clearAnimation();
      return;
    }

    const image = overlay.querySelector('.dice-result-image');
    if (!image) return;
    if (image !== activeImage || image.dataset.diceAnimating !== '1') {
      startAnimation(image);
    }
  }

  ROLL_FRAMES.forEach((src) => {
    const img = new Image();
    img.src = src;
  });

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