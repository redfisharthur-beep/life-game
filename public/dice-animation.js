(() => {
  const SINGLE_ROLL_FRAMES = [
    '/images/roll1.png',
    '/images/roll2.png',
    '/images/roll3.png',
    '/images/roll4.png',
    '/images/roll5.png',
  ];
  const DOUBLE_ROLL_FRAMES = [
    '/images/2roll1.png',
    '/images/2roll2.png',
    '/images/2roll3.png',
    '/images/2roll4.png',
    '/images/2roll5.png',
  ];
  const TRIPLE_ROLL_FRAMES = [
    '/images/3roll1.png',
    '/images/3roll2.png',
    '/images/3roll3.png',
    '/images/3roll4.png',
    '/images/3roll5.png',
  ];
  const FRAME_MS = 300;
  const ROLL_MS = 1500;
  const FINAL_HOLD_MS = 1500;

  const singleRollAudio = new Audio('/music/Dice_Roll.mp3');
  const multiRollAudio = new Audio('/music/2Dice_Roll.mp3');
  singleRollAudio.preload = 'auto';
  multiRollAudio.preload = 'auto';
  singleRollAudio.volume = 0.7;
  multiRollAudio.volume = 0.7;

  let activeImage = null;
  let rollInterval = null;
  let settleTimer = null;
  let holdTimer = null;
  let animationToken = 0;

  function stopDiceAudio() {
    [singleRollAudio, multiRollAudio].forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_) {}
    });
  }

  function playDiceAudio(isMulti) {
    stopDiceAudio();
    const audio = isMulti ? multiRollAudio : singleRollAudio;
    audio.volume = 0.7;
    const playPromise = audio.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  }

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
    stopDiceAudio();
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
    const isTriple = Boolean(image.closest('.triple-dice-total'));
    const isDouble = Boolean(image.closest('.double-dice-total'));
    const frames = isTriple ? TRIPLE_ROLL_FRAMES : isDouble ? DOUBLE_ROLL_FRAMES : SINGLE_ROLL_FRAMES;
    let frameIndex = 0;

    image.classList.remove('dice-landed');
    image.classList.add('dice-rolling');
    image.src = frames[0];
    playDiceAudio(isDouble || isTriple);

    rollInterval = setInterval(() => {
      if (token !== animationToken || !image.isConnected) return;
      frameIndex += 1;
      if (frameIndex >= frames.length) {
        clearInterval(rollInterval);
        rollInterval = null;
        frameIndex = frames.length - 1;
      }
      image.src = frames[frameIndex];
    }, FRAME_MS);

    settleTimer = setTimeout(() => {
      if (token !== animationToken || !image.isConnected) return;
      if (rollInterval) {
        clearInterval(rollInterval);
        rollInterval = null;
      }
      stopDiceAudio();
      image.src = finalSrc;
      image.alt = finalAlt;
      image.classList.remove('dice-rolling');
      image.classList.add('dice-landed');
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

  [...SINGLE_ROLL_FRAMES, ...DOUBLE_ROLL_FRAMES, ...TRIPLE_ROLL_FRAMES].forEach((src) => {
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
