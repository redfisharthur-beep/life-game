(() => {
  const ACTIONS = {
    salary: { label: '領薪', image: '/images/salary.png' },
    buyStock: { label: '買股', image: '/images/buystock.png' },
    buyLand: { label: '圈地', image: '/images/buyland.png' },
    fate: { label: '命運', image: '/images/destiny.png' },
    sabotage: { label: '陷害', image: '/images/frame.png' },
    help: { label: '援助', image: '/images/assistance.png' },
    sellStock: { label: '賣股', image: '/images/Sellstock.png' },
    sellLand: { label: '賣地', image: '/images/Sellland.png' },
    dream: { label: '圓夢', image: '/images/dream.png' },
  };

  const HEAD_IMAGES = {
    doctor: '/images/doctorhead.png',
    engineer: '/images/engineerhead.png',
    sales: '/images/saleshead.png',
    office: '/images/officehead.png',
    athlete: '/images/athleteghead.png',
    rich: '/images/richghead.png',
    civilServant: '/images/civil%20servanthead.png',
    artist: '/images/artisthead.png',
  };

  const FALLBACK_IMAGES = {
    doctor: '/images/doctor.png',
    engineer: '/images/engineer.png',
    sales: '/images/sales.png',
    office: '/images/office.png',
    athlete: '/images/athlete.png',
    rich: '/images/rich.png',
    civilServant: '/images/civil%20servant.png',
    artist: '/images/artist.png',
  };

  const NEGATIVE_FATE_IMAGES = [
    { label: '花錢消災', image: '/images/Spendmoney.png' },
    { label: '黑天鵝', image: '/images/Black%20Swan.png' },
    { label: '打房政策', image: '/images/measures%20to%20curb%20the%20property%20market.png' },
    { label: '人生低潮', image: '/images/Unlucky.png' },
  ];

  const POSITIVE_FATE_IMAGES = [
    { label: '中樂透', image: '/images/Lotto.png' },
    { label: '股神降臨', image: '/images/Investment%20Guru.png' },
    { label: '政策利多', image: '/images/Favorable%20policies.png' },
    { label: '幸福降臨', image: '/images/Unbelievable.png' },
  ];

  const CHOICE_MS = 1500;
  const DICE_MS = 3000;
  const RESULT_MS = 3500;
  const RESULT_START_MS = CHOICE_MS + DICE_MS;
  const SHOWCASE_MS = CHOICE_MS + DICE_MS + RESULT_MS;

  let lastShowcaseKey = null;
  let stageTimers = [];
  let lockTimer = null;

  const overlay = document.createElement('section');
  overlay.className = 'action-showcase hidden';
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="action-showcase-card">
      <div id="actionShowcaseKicker" class="action-showcase-kicker"></div>
      <h2 id="actionShowcaseTitle" class="action-showcase-title"></h2>
      <div id="actionShowcaseBody"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const kickerEl = document.getElementById('actionShowcaseKicker');
  const titleEl = document.getElementById('actionShowcaseTitle');
  const bodyEl = document.getElementById('actionShowcaseBody');

  function positionShowcaseOverActions() {
    const actionGrid = document.getElementById('actionGrid');
    if (!actionGrid) {
      overlay.style.removeProperty('--showcase-top');
      return;
    }
    const rect = actionGrid.getBoundingClientRect();
    const minimumRemainingHeight = 220;
    const top = Math.max(0, Math.min(rect.top - 8, window.innerHeight - minimumRemainingHeight));
    overlay.style.setProperty('--showcase-top', `${Math.round(top)}px`);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function clearStageTimers() {
    stageTimers.forEach((timer) => clearTimeout(timer));
    stageTimers = [];
    if (lockTimer) {
      clearInterval(lockTimer);
      lockTimer = null;
    }
  }

  function hideShowcase() {
    clearStageTimers();
    overlay.classList.add('hidden');
    overlay.classList.remove('choice-stage-active', 'dice-stage-active', 'result-stage-active');
    restoreCurrentTurnIfReady();
  }

  function lockActionButtons() {
    document.querySelectorAll('.action-button').forEach((button) => {
      button.disabled = true;
    });
  }

  function getPlayerHead(player) {
    if (!player) return '/images/logo.png';
    return HEAD_IMAGES[player.profession] || FALLBACK_IMAGES[player.profession] || '/images/logo.png';
  }

  function getSingleDieImage(value) {
    const point = Number(value);
    return Number.isInteger(point) && point >= 1 && point <= 6 ? `/images/${point}.png` : '/images/dice.png';
  }

  function getDoubleDiceImage(total) {
    const point = Number(total);
    return Number.isInteger(point) && point >= 2 && point <= 12 ? `/images/2-${point}.png` : '/images/dice.png';
  }

  function getTripleDiceImage(total) {
    const point = Number(total);
    return Number.isInteger(point) && point >= 3 && point <= 18 ? `/images/3-${point}.png` : '/images/dice.png';
  }

  function showActionStage(playerName, action) {
    positionShowcaseOverActions();
    overlay.classList.add('choice-stage-active');
    overlay.classList.remove('dice-stage-active', 'result-stage-active');
    kickerEl.textContent = `${playerName} 選擇`;
    titleEl.textContent = '';
    bodyEl.innerHTML = `<img class="action-showcase-image" src="${action.image}" alt="${action.label}" decoding="async" />`;
  }

  function showDiceStage(event) {
    positionShowcaseOverActions();
    const dice = Array.isArray(event.dice) ? event.dice : [];
    const total = Number(event.diceTotal || 0);
    const diceCount = Math.max(1, Math.min(3, dice.length || 1));

    overlay.classList.add('dice-stage-active');
    overlay.classList.remove('choice-stage-active', 'result-stage-active');
    kickerEl.textContent = '';
    titleEl.textContent = '';

    let diceImage = getSingleDieImage(Number(dice[0] || total || 0));
    let imageAlt = `骰子 ${Number(dice[0] || total || 0)} 點`;
    let imageClass = 'single-dice';

    if (diceCount === 2) {
      diceImage = getDoubleDiceImage(total);
      imageAlt = `雙骰合計 ${total}`;
      imageClass = 'double-dice-total';
    } else if (diceCount === 3) {
      diceImage = getTripleDiceImage(total);
      imageAlt = `三骰合計 ${total}`;
      imageClass = 'triple-dice-total';
    }

    bodyEl.innerHTML = `
      <div class="dice-result-stage" aria-label="骰子結果 ${total}">
        <div class="dice-result-images ${imageClass}">
          <img class="dice-result-image" src="${diceImage}" alt="${imageAlt}" decoding="async" />
        </div>
      </div>
    `;
  }

  function secondaryFateVisual(event) {
    if (event.type === 'sabotage') {
      return NEGATIVE_FATE_IMAGES[Math.max(0, Math.min(3, Number(event.effectIndex) || 0))];
    }
    if (event.type === 'help') {
      return POSITIVE_FATE_IMAGES[Math.max(0, Math.min(3, Number(event.effectIndex) || 0))];
    }
    return null;
  }

  function showResultStage(room, playerName, event, action) {
    positionShowcaseOverActions();
    overlay.classList.add('result-stage-active');
    overlay.classList.remove('choice-stage-active', 'dice-stage-active');
    kickerEl.textContent = '';
    titleEl.textContent = '';

    const actor = room.players.find((item) => item.id === event.playerId) || { name: playerName };
    const actorName = actor?.name || playerName || '玩家';
    const fateVisual = secondaryFateVisual(event);

    bodyEl.innerHTML = `
      <div class="simple-choice-result">
        <div class="simple-choice-player">
          <img class="simple-choice-head" src="${getPlayerHead(actor)}" alt="${escapeHtml(actorName)}" decoding="async" />
          <strong class="simple-choice-name">${escapeHtml(actorName)}</strong>
        </div>
        <img class="simple-choice-action" src="${action.image}" alt="${escapeHtml(action.label)}" decoding="async" />
        ${fateVisual ? `<img class="simple-choice-fate" src="${fateVisual.image}" alt="${escapeHtml(fateVisual.label)}" decoding="async" />` : ''}
      </div>
    `;
  }

  function restoreCurrentTurnIfReady() {
    if (typeof currentRoom !== 'undefined' && currentRoom?.game?.deadline && typeof renderGame === 'function') {
      renderGame(currentRoom);
    }
  }

  function playShowcase(room) {
    const game = room?.game;
    const event = game?.lastEvent;
    const action = ACTIONS[event?.type];
    const showcaseUntil = Number(game?.showcaseUntil || 0);
    const now = Number(room?.serverTime || Date.now());
    const remaining = showcaseUntil - now;

    if (!game || !event || !action || !Array.isArray(event.dice) || !game.turnId || remaining <= 0) {
      if (!overlay.classList.contains('hidden') && (!showcaseUntil || remaining <= 0 || game?.deadline)) hideShowcase();
      return;
    }

    const key = `${room.code}:${game.turnId}`;
    if (key === lastShowcaseKey) return;
    lastShowcaseKey = key;

    clearStageTimers();
    lockActionButtons();
    lockTimer = setInterval(lockActionButtons, 250);

    const player = room.players.find((item) => item.id === event.playerId);
    const playerName = player?.name || '玩家';
    const elapsed = Math.max(0, SHOWCASE_MS - remaining);

    positionShowcaseOverActions();
    overlay.classList.remove('hidden');
    if (elapsed < CHOICE_MS) showActionStage(playerName, action);
    else if (elapsed < RESULT_START_MS) showDiceStage(event);
    else showResultStage(room, playerName, event, action);

    if (elapsed < CHOICE_MS) {
      stageTimers.push(setTimeout(() => {
        lockActionButtons();
        showDiceStage(event);
      }, CHOICE_MS - elapsed));
    }

    if (elapsed < RESULT_START_MS) {
      stageTimers.push(setTimeout(() => {
        lockActionButtons();
        showResultStage(room, playerName, event, action);
      }, RESULT_START_MS - elapsed));
    }

    stageTimers.push(setTimeout(hideShowcase, remaining));
  }

  window.addEventListener('resize', () => {
    if (!overlay.classList.contains('hidden')) positionShowcaseOverActions();
  });
  window.addEventListener('scroll', () => {
    if (!overlay.classList.contains('hidden')) positionShowcaseOverActions();
  }, { passive: true });

  socket.on('room:update', playShowcase);
})();