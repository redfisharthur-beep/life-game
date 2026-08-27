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
    engineer: '資訊工程師',
    sales: '超級業務員',
    office: '白領上班族',
    athlete: '職棒球員',
    rich: '企業富二代',
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

  function makeSummaryItem(label, value, className = '') {
    const item = document.createElement('span');
    item.className = `player-summary-item ${className}`.trim();
    item.append(
      makeText('player-summary-label', label),
      makeText('player-summary-value', value)
    );
    return item;
  }

  function makeHappiness(value) {
    const item = document.createElement('div');
    item.className = 'player-status-happiness';
    item.setAttribute('aria-label', `幸福值 ${Number(value || 0).toFixed(2)}`);

    const icon = document.createElement('img');
    icon.className = 'player-status-happiness-icon';
    icon.src = '/images/happiness.png';
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');

    const number = makeText(
      'player-status-happiness-value',
      Number(value || 0).toFixed(2)
    );

    item.append(icon, number);
    return item;
  }

  function getDesktopColumns(count) {
    if (count <= 2) return Math.max(1, count);
    if (count === 4) return 2;
    return 3;
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

    bar.style.setProperty('--player-columns', String(getDesktopColumns(room.players.length)));
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

      identity.append(
        avatar,
        identityText,
        makeHappiness(player.happiness)
      );

      if (player.id === room.game.currentPlayerId && room.phase === 'game') {
        identity.append(makeText('player-status-turn-badge', '行動中'));
      }

      const summary = document.createElement('div');
      summary.className = 'player-status-summary';
      summary.append(
        makeSummaryItem('總資產', formatInteger(player.totalAssets), 'assets'),
        makeSummaryItem('現金', formatInteger(player.cash)),
        makeSummaryItem('股票', formatUnit(player.stocks)),
        makeSummaryItem('土地', formatUnit(player.land))
      );

      card.append(identity, summary);
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