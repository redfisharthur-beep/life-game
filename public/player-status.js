(() => {
  const HEAD_IMAGES = {
    doctor: '/images/doctorhead.png',
    engineer: '/images/engineerhead.png',
    sales: '/images/saleshead.png',
    office: '/images/officehead.png',
    athlete: '/images/athleteghead.png',
    rich: '/images/richghead.png',
  };

  const FALLBACK_IMAGES = {
    doctor: '/images/doctor.png',
    engineer: '/images/engineer.png',
    sales: '/images/sales.png',
    office: '/images/office.png',
    athlete: '/images/athlete.png',
    rich: '/images/rich.png',
  };

  const PROFESSION_NAMES = {
    doctor: '醫師',
    engineer: '工程師',
    sales: '超業',
    office: '白領',
    athlete: '運動員',
    rich: '富二代',
  };

  function formatInteger(value) {
    return Math.round(Number(value) || 0).toLocaleString('zh-TW');
  }

  function formatUnit(value) {
    return Number(value || 0).toLocaleString('zh-TW', {
      minimumFractionDigits: Number(value || 0) % 1 ? 1 : 0,
      maximumFractionDigits: 1,
    });
  }

  function makeText(className, text) {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    return element;
  }

  function makeMetric(label, value, className = '') {
    const metric = document.createElement('div');
    metric.className = `player-status-metric ${className}`.trim();
    metric.append(
      makeText('player-status-metric-label', label),
      makeText('player-status-metric-value', value)
    );
    return metric;
  }

  function makeHolding(label, value) {
    const item = document.createElement('span');
    item.className = 'player-holding';
    item.append(
      makeText('player-holding-label', label),
      makeText('player-holding-value', value)
    );
    return item;
  }

  function renderPlayerStatus(room) {
    const bar = document.getElementById('playerStatusBar');
    const mainCard = document.getElementById('lobbyCard');
    if (!bar || !mainCard) return;

    const inGame = Boolean(
      room?.game && (room.phase === 'game' || room.phase === 'finished')
    );

    mainCard.classList.toggle('game-mode', inGame);

    if (!inGame) {
      bar.innerHTML = '';
      return;
    }

    bar.style.setProperty('--player-count', String(Math.min(room.players.length, 6)));
    bar.innerHTML = '';

    room.players.forEach((player) => {
      const professionId = player.profession || '';
      const card = document.createElement('article');
      card.className = 'player-status-card';

      if (player.id === socket.id) card.classList.add('me');
      if (player.id === room.game.currentPlayerId) card.classList.add('current');

      const identity = document.createElement('div');
      identity.className = 'player-status-identity';

      const avatar = document.createElement('img');
      avatar.className = 'player-status-avatar';
      avatar.src = HEAD_IMAGES[professionId] || FALLBACK_IMAGES[professionId] || '/images/Logo.png';
      avatar.alt = PROFESSION_NAMES[professionId] || '職業';
      avatar.addEventListener('error', () => {
        const fallback = FALLBACK_IMAGES[professionId];
        if (fallback && avatar.src !== fallback) {
          avatar.src = fallback;
        }
      }, { once: true });

      const identityText = document.createElement('div');
      identityText.className = 'player-status-identity-text';
      identityText.append(
        makeText('player-status-profession', PROFESSION_NAMES[professionId] || '未選職業'),
        makeText('player-status-name', player.name)
      );

      identity.append(avatar, identityText);

      if (player.id === room.game.currentPlayerId && room.phase === 'game') {
        identity.append(makeText('player-status-turn-badge', '行動中'));
      }

      const metrics = document.createElement('div');
      metrics.className = 'player-status-metrics';
      metrics.append(
        makeMetric('總資產', formatInteger(player.totalAssets), 'assets'),
        makeMetric('幸福值', Number(player.happiness || 0).toFixed(2), 'happiness')
      );

      const holdings = document.createElement('div');
      holdings.className = 'player-holdings';
      holdings.append(
        makeHolding('現金', formatInteger(player.cash)),
        makeHolding('股票', formatUnit(player.stocks)),
        makeHolding('土地', formatUnit(player.land))
      );

      card.append(identity, metrics, holdings);
      bar.appendChild(card);
    });
  }

  socket.on('room:update', renderPlayerStatus);
  socket.on('room:started', renderPlayerStatus);

  setInterval(() => {
    try {
      renderPlayerStatus(currentRoom);
    } catch (_) {
      // app.js 尚未建立狀態時略過。
    }
  }, 800);
})();
