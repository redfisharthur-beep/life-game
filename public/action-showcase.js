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

  const FATE_RESULTS = [
    { label: '中樂透', image: '/images/Lotto.png' },
    { label: '花錢消災', image: '/images/Spendmoney.png' },
    { label: '股神降臨', image: '/images/Investment%20Guru.png' },
    { label: '黑天鵝', image: '/images/Black%20Swan.png' },
    { label: '政策利多', image: '/images/Favorable%20policies.png' },
    { label: '打房政策', image: '/images/measures%20to%20curb%20the%20property%20market.png' },
    { label: '社福救濟', image: '/images/Social%20welfare.png' },
    { label: '幸福降臨', image: '/images/Unbelievable.png' },
    { label: '人生低潮', image: '/images/Unlucky.png' },
  ];

  const STAGE_MS = 2000;

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

  function lockActionButtons() {
    document.querySelectorAll('.action-button').forEach((button) => {
      button.disabled = true;
    });
  }

  function setDiceStageMode(enabled) {
    overlay.classList.toggle('dice-stage-active', Boolean(enabled));
  }

  function getSingleDieImage(value) {
    const point = Number(value);
    if (Number.isInteger(point) && point >= 1 && point <= 6) {
      return `/images/${point}.png`;
    }
    return '/images/dice.png';
  }

  function showActionStage(playerName, action) {
    setDiceStageMode(false);
    kickerEl.textContent = `${playerName} 的選擇`;
    titleEl.textContent = action.label;
    bodyEl.innerHTML = `<img class="action-showcase-image" src="${action.image}" alt="${action.label}" />`;
  }

  function showDiceStage(playerName, event) {
    const dice = Array.isArray(event.dice) ? event.dice : [];
    const total = Number(event.diceTotal || 0);
    const diceCount = Math.max(1, Math.min(2, dice.length || 1));

    setDiceStageMode(true);
    kickerEl.textContent = `${playerName} 骰到`;
    titleEl.textContent = String(total);

    const diceImages = Array.from({ length: diceCount }, (_, index) => {
      const point = Number(dice[index] || 0);
      const image = diceCount === 1 ? getSingleDieImage(point) : '/images/dice.png';
      const alt = diceCount === 1 && point >= 1 && point <= 6
        ? `${point}`
        : `第 ${index + 1} 顆骰子`;
      return `<img class="dice-result-image" src="${image}" alt="${alt}" />`;
    }).join('');

    bodyEl.innerHTML = `
      <div class="dice-result-stage" aria-label="骰子結果 ${total}">
        <div class="dice-result-images ${diceCount > 1 ? 'two-dice' : ''}">${diceImages}</div>
      </div>
    `;
  }

  function showFateResultStage(playerName, event) {
    setDiceStageMode(false);
    const fateIndex = Number(event.fateIndex);
    const fateResult = FATE_RESULTS[fateIndex];

    kickerEl.textContent = `${playerName} 抽到命運`;
    titleEl.textContent = fateResult?.label || '命運結果';

    bodyEl.innerHTML = `
      <div class="fate-result-wrap">
        ${fateResult ? `<img class="fate-result-image" src="${fateResult.image}" alt="${fateResult.label}" />` : ''}
        <p class="action-showcase-result fate-result-text"></p>
      </div>
    `;

    bodyEl.querySelector('.fate-result-text').textContent = event.text || '命運事件完成';
  }

  function showResultStage(playerName, event) {
    setDiceStageMode(false);
    if (event.type === 'fate') {
      showFateResultStage(playerName, event);
      return;
    }

    kickerEl.textContent = `${playerName} 的行動結果`;
    titleEl.textContent = '結果公布';
    bodyEl.innerHTML = `<p class="action-showcase-result"></p>`;
    bodyEl.querySelector('.action-showcase-result').textContent = event.text || '行動完成';
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

    if (!game || !event || !action || !Array.isArray(event.dice) || !game.turnId) return;
    if (game.deadline !== null) return;

    const key = `${room.code}:${game.turnId}`;
    if (key === lastShowcaseKey) return;
    lastShowcaseKey = key;

    clearStageTimers();
    lockActionButtons();
    lockTimer = setInterval(lockActionButtons, 80);

    const player = room.players.find((item) => item.id === event.playerId);
    const playerName = player?.name || '玩家';

    overlay.classList.remove('hidden');
    showActionStage(playerName, action);

    stageTimers.push(setTimeout(() => {
      lockActionButtons();
      showDiceStage(playerName, event);
    }, STAGE_MS));

    stageTimers.push(setTimeout(() => {
      lockActionButtons();
      showResultStage(playerName, event);
    }, STAGE_MS * 2));

    stageTimers.push(setTimeout(() => {
      overlay.classList.add('hidden');
      setDiceStageMode(false);
      if (lockTimer) {
        clearInterval(lockTimer);
        lockTimer = null;
      }
      restoreCurrentTurnIfReady();
    }, STAGE_MS * 3));
  }

  socket.on('room:update', (room) => {
    playShowcase(room);
  });
})();
