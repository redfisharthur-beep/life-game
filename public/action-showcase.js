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

  const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
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

  function showActionStage(playerName, action) {
    kickerEl.textContent = `${playerName} 的選擇`;
    titleEl.textContent = action.label;
    bodyEl.innerHTML = `<img class="action-showcase-image" src="${action.image}" alt="${action.label}" />`;
  }

  function showDiceStage(playerName, event) {
    const dice = Array.isArray(event.dice) ? event.dice : [];
    const total = Number(event.diceTotal || 0);
    kickerEl.textContent = `${playerName} 骰到`;
    titleEl.textContent = `${total} 點`;

    const faces = dice
      .map((value) => `<span aria-label="${value} 點">${DICE_FACES[value] || value}</span>`)
      .join('');

    bodyEl.innerHTML = `
      <div class="action-showcase-dice">${faces}</div>
      ${dice.length > 1 ? `<div class="action-showcase-total">合計 ${total} 點</div>` : ''}
    `;
  }

  function showResultStage(playerName, event) {
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
