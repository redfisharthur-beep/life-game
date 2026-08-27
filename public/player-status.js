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

  function formatAsset(value) {
    return Math.round(Number(value) || 0).toLocaleString('zh-TW');
  }

  function formatUnit(value) {
    return Number(value || 0).toLocaleString('zh-TW', {
      minimumFractionDigits: Number(value || 0) % 1 ? 1 : 0,
      maximumFractionDigits: 1,
    });
  }

  function formatHappinessDisplay(value) {
    return String(Math.trunc(Number(value || 0)));
  }

  function makeText(className, text) {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    return element;
  }

  function makeInfoCell(label, value, className = '') {
    const item = document.createElement('div');
    item.className = `player-info-cell ${className}`.trim();
    item.append(
      makeText('player-info-label', label),
      makeText('player-info-value', value)
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

    item.append(
      icon,
      makeText('player-status-happiness-value', formatHappinessDisplay(value))
    );
    return item;
  }

  function sortPlayers(players) {
    const mine = typeof myPlayerId !== 'undefined' ? myPlayerId : null;
    return [...players].sort((a, b) => {
      const aIsMe = mine && a.id === mine;
      const bIsMe = mine && b.id === mine;
      if (aIsMe !== bIsMe) return aIsMe ? -1 : 1;

      const happinessDiff = Number(b.happiness || 0) - Number(a.happiness || 0);
      if (Math.abs(happinessDiff) > 0.000001) return happinessDiff;

      const assetDiff = Number(b.totalAssets || 0) - Number(a.totalAssets || 0);
      if (Math.abs(assetDiff) > 0.000001) return assetDiff;

      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
    });
  }

  function renderPlayerStatus(room) {
    const bar = document.getElementById('playerStatusBar');
    const mainCard = document.getElementById('lobbyCard');
    if (!bar || !mainCard) return;

    const inGame = Boolean(room?.game && (room.phase === 'game' || room.phase === 'finished'));
    mainCard.classList.toggle('game-mode', inGame);

    if (!inGame) {
      bar.innerHTML = '';
      return;
    }

    bar.innerHTML = '';

    sortPlayers(room.players || []).forEach((player) => {
      const professionId = player.profession || '';
      const card = document.createElement('article');
      card.className = 'player-status-card';

      const isMe = typeof myPlayerId !== 'undefined' && player.id === myPlayerId;
      if (isMe) card.classList.add('me');
      if (player.id === room.game.currentPlayerId) card.classList.add('current');
      if (!player.connected) card.classList.add('offline');

      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'player-status-avatar-wrap';

      const avatar = document.createElement('img');
      avatar.className = 'player-status-avatar';
      avatar.src = HEAD_IMAGES[professionId] || FALLBACK_IMAGES[professionId] || '/images/logo.png';
      avatar.alt = PROFESSION_NAMES[professionId] || '職業';
      avatar.addEventListener('error', () => {
        const fallback = FALLBACK_IMAGES[professionId];
        if (fallback && avatar.src !== fallback) avatar.src = fallback;
      }, { once: true });
      avatarWrap.appendChild(avatar);

      const infoGrid = document.createElement('div');
      infoGrid.className = 'player-status-info-grid';

      const nameCell = document.createElement('div');
      nameCell.className = 'player-info-cell player-info-name';
      nameCell.append(makeText('player-status-name', player.connected ? player.name : `${player.name}（離線）`));

      infoGrid.append(
        nameCell,
        makeInfoCell('總資產', formatAsset(player.totalAssets), 'total-assets'),
        makeInfoCell('現金', formatInteger(player.cash), 'cash'),
        makeInfoCell('股票', formatUnit(player.stocks), 'stocks'),
        makeInfoCell('土地', formatUnit(player.land), 'land')
      );

      if (player.id === room.game.currentPlayerId && room.phase === 'game') {
        card.append(makeText('player-status-turn-badge', '行動中'));
      }

      card.append(avatarWrap, infoGrid, makeHappiness(player.happiness));
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
