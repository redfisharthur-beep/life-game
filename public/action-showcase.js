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

  const CHOICE_MS = 2000;
  const DICE_MS = 2000;
  const RESULT_MS = 5000;
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
    setChoiceStageMode(false);
    setDiceStageMode(false);
    overlay.classList.remove('result-stage-active');
    restoreCurrentTurnIfReady();
  }

  function lockActionButtons() {
    document.querySelectorAll('.action-button').forEach((button) => {
      button.disabled = true;
    });
  }

  function setDiceStageMode(enabled) {
    overlay.classList.toggle('dice-stage-active', Boolean(enabled));
  }

  function setChoiceStageMode(enabled) {
    overlay.classList.toggle('choice-stage-active', Boolean(enabled));
  }

  function getSingleDieImage(value) {
    const point = Number(value);
    if (Number.isInteger(point) && point >= 1 && point <= 6) return `/images/${point}.png`;
    return '/images/dice.png';
  }

  function getDoubleDiceImage(total) {
    const point = Number(total);
    if (Number.isInteger(point) && point >= 2 && point <= 12) return `/images/2-${point}.png`;
    return '/images/dice.png';
  }

  function showActionStage(playerName, action) {
    setDiceStageMode(false);
    setChoiceStageMode(true);
    overlay.classList.remove('result-stage-active');
    kickerEl.textContent = `${playerName} 選擇`;
    titleEl.textContent = '';
    bodyEl.innerHTML = `<img class="action-showcase-image" src="${action.image}" alt="${action.label}" />`;
  }

  function showDiceStage(playerName, event) {
    const dice = Array.isArray(event.dice) ? event.dice : [];
    const total = Number(event.diceTotal || 0);
    const diceCount = Math.max(1, Math.min(2, dice.length || 1));

    setChoiceStageMode(false);
    setDiceStageMode(true);
    overlay.classList.remove('result-stage-active');
    kickerEl.textContent = '';
    titleEl.textContent = '';

    let diceImage = '/images/dice.png';
    let imageAlt = `骰子結果 ${total}`;
    let imageClass = 'single-dice';

    if (diceCount === 1) {
      const point = Number(dice[0] || total || 0);
      diceImage = getSingleDieImage(point);
      imageAlt = `${point}`;
    } else {
      diceImage = getDoubleDiceImage(total);
      imageAlt = `雙骰合計 ${total}`;
      imageClass = 'double-dice-total';
    }

    bodyEl.innerHTML = `
      <div class="dice-result-stage" aria-label="骰子結果 ${total}">
        <div class="dice-result-images ${imageClass}">
          <img class="dice-result-image" src="${diceImage}" alt="${imageAlt}" />
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
    const normalizedLabel = label === '幸福' ? '幸福值' : label;
    return `${normalizedLabel} ${signed(value)}`;
  }

  function firstSignedEffect(text) {
    const match = String(text || '').match(/(現金|股票|土地|幸福)\s*([+-])\s*(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const value = Number(match[3]) * (match[2] === '-' ? -1 : 1);
    return makeEffect(match[1], value);
  }

  function pushResult(rows, name, effects) {
    const cleanEffects = effects.filter(Boolean).filter((item) => !item.endsWith(' 0'));
    if (!cleanEffects.length) cleanEffects.push('無資產變動');
    rows.push({ name, effects: cleanEffects });
  }

  function buildResultRows(room, event, playerName) {
    const rows = [];
    const target = room.players.find((item) => item.id === event.targetId);
    const total = Number(event.diceTotal || 0);

    if (event.type === 'salary') {
      pushResult(rows, playerName, [makeEffect('現金', event.amount)]);
    } else if (event.type === 'buyStock') {
      const cash = Number(event.salaryIncome || 0) - (event.success ? Number(event.cost || 0) : 0);
      pushResult(rows, playerName, [
        makeEffect('現金', cash),
        event.success ? makeEffect('股票', event.units) : null,
      ]);
    } else if (event.type === 'buyLand') {
      const cash = Number(event.salaryIncome || 0) - (event.success ? Number(event.cost || 0) : 0);
      pushResult(rows, playerName, [
        makeEffect('現金', cash),
        event.success ? makeEffect('土地', event.units) : null,
      ]);
    } else if (event.type === 'sellStock') {
      pushResult(rows, playerName, [
        makeEffect('現金', Number(event.salaryIncome || 0) + Number(event.proceeds || 0)),
        Number(event.units || 0) ? makeEffect('股票', -Number(event.units || 0)) : null,
      ]);
    } else if (event.type === 'sellLand') {
      pushResult(rows, playerName, [
        makeEffect('現金', Number(event.salaryIncome || 0) + Number(event.proceeds || 0)),
        Number(event.units || 0) ? makeEffect('土地', -Number(event.units || 0)) : null,
      ]);
    } else if (event.type === 'dream') {
      if (event.success) {
        const liquidation = event.liquidation || {};
        pushResult(rows, playerName, [
          makeEffect('現金', Number(event.salaryIncome || 0) + Number(liquidation.proceeds || 0) - Number(event.fee || 0)),
          Number(liquidation.stocks || 0) ? makeEffect('股票', -Number(liquidation.stocks || 0)) : null,
          Number(liquidation.land || 0) ? makeEffect('土地', -Number(liquidation.land || 0)) : null,
          makeEffect('幸福', event.happinessGain),
        ]);
      } else {
        pushResult(rows, playerName, [makeEffect('現金', event.salaryIncome)]);
      }
    } else if (event.type === 'sabotage') {
      if (target) pushResult(rows, target.name, [firstSignedEffect(event.text)]);
      pushResult(rows, playerName, [makeEffect('現金', event.bonus)]);
    } else if (event.type === 'help') {
      if (target) pushResult(rows, target.name, [firstSignedEffect(event.text)]);
      pushResult(rows, playerName, [makeEffect('現金', event.bonus)]);
    } else if (event.type === 'fate') {
      const fateIndex = Number(event.fateIndex);
      if (fateIndex === 0) {
        pushResult(rows, playerName, [makeEffect('現金', 150 * total)]);
      } else if (fateIndex === 2) {
        pushResult(rows, playerName, [makeEffect('股票', 5 * total)]);
      } else if (fateIndex === 4) {
        pushResult(rows, playerName, [makeEffect('土地', 5 * total)]);
      } else if (fateIndex === 6) {
        const received = Number(String(event.text || '').match(/共支付\s*(\d+(?:\.\d+)?)/)?.[1] || 0);
        pushResult(rows, playerName, [makeEffect('現金', received)]);
      } else if (fateIndex === 7) {
        pushResult(rows, playerName, [makeEffect('幸福', total)]);
      } else if (fateIndex === 8) {
        pushResult(rows, playerName, [makeEffect('幸福', -(0.5 * total))]);
      } else {
        pushResult(rows, playerName, [firstSignedEffect(event.text)]);
      }
    } else {
      pushResult(rows, playerName, [firstSignedEffect(event.text)]);
    }

    return rows;
  }

  function showResultStage(room, playerName, event) {
    setChoiceStageMode(false);
    setDiceStageMode(false);
    overlay.classList.add('result-stage-active');
    kickerEl.textContent = '';
    titleEl.textContent = '';

    const rows = buildResultRows(room, event, playerName);
    bodyEl.innerHTML = `
      <div class="simple-result">
        ${rows.map((row) => `
          <div class="simple-result-row">
            <strong class="simple-result-player">${row.name}</strong>
            <div class="simple-result-effects">
              ${row.effects.map((effect) => `<span class="simple-result-effect">${effect}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function restoreCurrentTurnIfReady() {
    if (
      typeof currentRoom !== 'undefined'
      && currentRoom?.game?.deadline
      && typeof renderGame === 'function'
    ) {
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
      if (!overlay.classList.contains('hidden') && (!showcaseUntil || remaining <= 0 || game?.deadline)) {
        hideShowcase();
      }
      return;
    }

    const key = `${room.code}:${game.turnId}`;
    if (key === lastShowcaseKey) return;
    lastShowcaseKey = key;

    clearStageTimers();
    lockActionButtons();
    lockTimer = setInterval(lockActionButtons, 80);

    const player = room.players.find((item) => item.id === event.playerId);
    const playerName = player?.name || '玩家';
    const elapsed = Math.max(0, SHOWCASE_MS - remaining);

    overlay.classList.remove('hidden');
    if (elapsed < CHOICE_MS) {
      showActionStage(playerName, action);
    } else if (elapsed < RESULT_START_MS) {
      showDiceStage(playerName, event);
    } else {
      showResultStage(room, playerName, event);
    }

    if (elapsed < CHOICE_MS) {
      stageTimers.push(setTimeout(() => {
        lockActionButtons();
        showDiceStage(playerName, event);
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

  socket.on('room:update', playShowcase);
})();
