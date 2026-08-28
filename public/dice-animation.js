(() => {
  const ROLL_FRAMES = Array.from({ length: 12 }, (_, index) => `/images/roll${index + 1}.png`);
  const FRAME_MS = 100;
  const ROLL_MS = 1200;

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
      if (frameIndex >= ROLL_FRAMES.length) frameIndex = ROLL_FRAMES.length - 1;
      image.src = ROLL_FRAMES[frameIndex];
    }, FRAME_MS);

    settleTimer = setTimeout(() => {
      if (token !== animationToken || !image.isConnected) return;
      if (rollInterval) {
        clearInterval(rollInterval);
        rollInterval = null;
      }

      // 1.2 秒素材動畫結束後，切回伺服器真正擲出的結果圖。
      // 骰子階段總長 2.2 秒，因此最終結果會完整定格 1 秒。
      image.src = finalSrc;
      image.alt = finalAlt;
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