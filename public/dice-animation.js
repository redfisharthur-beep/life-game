(() => {
  const ROLL_FRAMES = Array.from({ length: 12 }, (_, index) => `/images/roll${index + 1}.png`);
  const FRAME_MS = 75;
  const ROLL_MS = 900;

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
      frameIndex = (frameIndex + 1) % ROLL_FRAMES.length;
      image.src = ROLL_FRAMES[frameIndex];
    }, FRAME_MS);

    settleTimer = setTimeout(() => {
      if (token !== animationToken || !image.isConnected) return;
      if (rollInterval) {
        clearInterval(rollInterval);
        rollInterval = null;
      }

      // 最後一定切回伺服器真正骰到的結果圖，並在骰子階段剩餘時間內定格約 1 秒。
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

  // 預載 12 張滾動素材，減少第一輪切圖閃爍。
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
