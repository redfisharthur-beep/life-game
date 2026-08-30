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

  const FATE_IMAGES = [
    POSITIVE_FATE_IMAGES[0],
    NEGATIVE_FATE_IMAGES[0],
    POSITIVE_FATE_IMAGES[1],
    NEGATIVE_FATE_IMAGES[1],
    POSITIVE_FATE_IMAGES[2],
    NEGATIVE_FATE_IMAGES[2],
    { label: '社福救濟', image: '/images/Social%20welfare.png' },
    POSITIVE_FATE_IMAGES[3],
    NEGATIVE_FATE_IMAGES[3],
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
    kickerEl.textContent = playerName;
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

  function signed(value) {
    const number = Number(value || 0);
    if (Math.abs(number) < 0.000001) return '0';
    return `${number > 0 ? '+' : '-'}${Math.abs(number)}`;
  }

  function makeEffect(label, value) {
    const normalized = label === '幸福' ? '幸福值' : label;
    return `${normalized} ${signed(value)}`;
  }

  function firstSignedEffect(text) {
    const match = String(text || '').match(/(現金|股票|土地|幸福)\s*([+-])\s*(\d+(?:\.\d+)?)/);
    if (!match) return null;
    return makeEffect(match[1], Number(match[3]) * (match[2] === '-' ? -1 : 1));
  }

  function pushRow(rows, player, fallbackName, effects) {
    const clean = effects.filter(Boolean).filter((item) => !item.endsWith(' 0'));
    if (!clean.length) clean.push('無資產變動');
    rows.push({ name: player?.name || fallbackName || '玩家', effects: clean });
  }

  function buildResultRows(room, event, actor) {
    const rows = [];
    const target = room.players.find((item) => item.id === event.targetId);
    const total = Number(event.diceTotal || 0);
    const playerName = actor?.name || '玩家';

    if (event.type === 'salary') {
      pushRow(rows, actor, playerName, [makeEffect('現金', event.amount)]);
    } else if (event.type === 'buyStock') {
      const cash = Number(event.salaryIncome || 0) - (event.success ? Number(event.cost || 0) : 0);
      pushRow(rows, actor, playerName, [makeEffect('現金', cash), event.success ? makeEffect('股票', event.units) : null]);
    } else if (event.type === 'buyLand') {
      const cash = Number(event.salaryIncome || 0) - (event.success ? Number(event.cost || 0) : 0);
      pushRow(rows, actor, playerName, [makeEffect('現金', cash), event.success ? makeEffect('土地', event.units) : null]);
    } else if (event.type === 'sellStock') {
      pushRow(rows, actor, playerName, [makeEffect('現金', Number(event.salaryIncome || 0) + Number(event.proceeds || 0)), Number(event.units || 0) ? makeEffect('股票', -Number(event.units || 0)) : null]);
    } else if (event.type === 'sellLand') {
      pushRow(rows, actor, playerName, [makeEffect('現金', Number(event.salaryIncome || 0) + Number(event.proceeds || 0)), Number(event.units || 0) ? makeEffect('土地', -Number(event.units || 0)) : null]);
    } else if (event.type === 'dream') {
      if (event.success) {
        const liquidation = event.liquidation || {};
        pushRow(rows, actor, playerName, [
          makeEffect('現金', Number(event.salaryIncome || 0) + Number(liquidation.proceeds || 0) - Number(event.fee || 0)),
          Number(liquidation.stocks || 0) ? makeEffect('股票', -Number(liquidation.stocks || 0)) : null,
          Number(liquidation.land || 0) ? makeEffect('土地', -Number(liquidation.land || 0)) : null,
          makeEffect('幸福', event.happinessGain),
        ]);
      } else {
        pushRow(rows, actor, playerName, [makeEffect('現金', event.salaryIncome)]);
      }
    } else if (event.type === 'sabotage') {
      if (target) pushRow(rows, target, target.name, [firstSignedEffect(event.text)]);
      pushRow(rows, actor, playerName, [makeEffect('現金', event.bonus)]);
    } else if (event.type === 'help') {
      if (target) pushRow(rows, target, target.name, [firstSignedEffect(event.text)]);
      pushRow(rows, actor, playerName, [makeEffect('現金', event.bonus)]);
    } else if (event.type === 'fate') {
      const index = Number(event.fateIndex);
      if (index === 0) pushRow(rows, actor, playerName, [makeEffect('現金', 150 * total)]);
      else if (index === 2) pushRow(rows, actor, playerName, [makeEffect('股票', 5 * total)]);
      else if (index === 4) pushRow(rows, actor, playerName, [makeEffect('土地', 5 * total)]);
      else if (index === 6) pushRow(rows, actor, playerName, [makeEffect('現金', event.received)]);
      else if (index === 7) pushRow(rows, actor, playerName, [makeEffect('幸福', event.happinessChange || total)]);
      else if (index === 8) pushRow(rows, actor, playerName, [makeEffect('幸福', event.happinessChange || -(0.5 * total))]);
      else pushRow(rows, actor, playerName, [firstSignedEffect(event.text)]);
    } else {
      pushRow(rows, actor, playerName, [firstSignedEffect(event.text)]);
    }
    return rows;
  }

  function fateVisualFor(event) {
    if (event.type === 'fate') {
      return FATE_IMAGES[Math.max(0, Math.min(FATE_IMAGES.length - 1, Number(event.fateIndex) || 0))];
    }
    if (event.type === 'sabotage') {
      return NEGATIVE_FATE_IMAGES[Math.max(0, Math.min(3, Number(event.effectIndex) || 0))];
    }
    if (event.type === 'help') {
      return POSITIVE_FATE_IMAGES[Math.max(0, Math.min(3, Number(event.effectIndex) || 0))];
    }
    return null;
  }

  function showResultStage(room, playerName, event) {
    positionShowcaseOverActions();
    overlay.classList.add('result-stage-active');
    overlay.classList.remove('choice-stage-active', 'dice-stage-active');
    kickerEl.textContent = '';
    titleEl.textContent = '';

    const actor = room.players.find((item) => item.id === event.playerId) || { name: playerName };
    const actorName = actor?.name || playerName || '玩家';
    const rows = buildResultRows(room, event, actor);
    const fateVisual = fateVisualFor(event);

    bodyEl.innerHTML = `
      <div class="simple-result">
        <div class="result-visual result-visual-single">
          <div class="result-person">
            <img class="result-person-head" src="${getPlayerHead(actor)}" alt="${escapeHtml(actorName)}" decoding="async" />
            <span class="result-person-name">${escapeHtml(actorName)}</span>
          </div>
        </div>
        <div class="simple-result-list">
          ${rows.map((row) => `
            <div class="simple-result-row">
              <strong class="simple-result-player">${escapeHtml(row.name)}</strong>
              <div class="simple-result-effects">
                ${row.effects.map((effect) => `<span class="simple-result-effect">${escapeHtml(effect)}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        ${fateVisual ? `
          <div class="result-event-visual">
            <img class="result-event-image" src="${fateVisual.image}" alt="${escapeHtml(fateVisual.label)}" decoding="async" />
          </div>
        ` : ''}
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
    else showResultStage(room, playerName, event);

    if (elapsed < CHOICE_MS) {
      stageTimers.push(setTimeout(() => {
        lockActionButtons();
        showDiceStage(event);
      }, CHOICE_MS - elapsed));
    }

    if (elapsed < RESULT_START_MS) {
      stageTimers.push(setTimeout(() => {
        lockActionButtons();
        showResultStage(room, playerName, event);
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