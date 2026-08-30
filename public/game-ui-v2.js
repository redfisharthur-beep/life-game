(() => {
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

  const FATE_IMAGES = [
    '/images/Lotto.png',
    '/images/Spendmoney.png',
    '/images/Investment%20Guru.png',
    '/images/Black%20Swan.png',
    '/images/Favorable%20policies.png',
    '/images/measures%20to%20curb%20the%20property%20market.png',
    '/images/Social%20welfare.png',
    '/images/Unbelievable.png',
    '/images/Unlucky.png',
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function headFor(player) {
    if (!player) return '/images/logo.png';
    return HEAD_IMAGES[player.profession] || FALLBACK_IMAGES[player.profession] || '/images/logo.png';
  }

  function signed(value) {
    const number = Number(value || 0);
    if (Math.abs(number) < 0.000001) return '0';
    return `${number > 0 ? '+' : ''}${number}`;
  }

  function targetEffectText(event, target) {
    const labels = ['現金', '股票', '土地', '幸福值'];
    const label = labels[Number(event.effectIndex)] || '數值';
    return `${target?.name || '玩家'} ${label} ${signed(event.targetChange)}`;
  }

  function patchRoundAnnouncement() {
    if (typeof currentRoom === 'undefined') return;
    const announcement = document.getElementById('roundAnnouncement');
    if (!announcement) return;

    const game = currentRoom?.game;
    const now = Number(currentRoom?.serverTime || Date.now());
    const round = Number(game?.round || 0);
    const shouldShow = currentRoom?.phase === 'game'
      && (round === 11 || round === 21)
      && Number(game?.transitionUntil || 0) > now;

    announcement.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) return;

    const image = announcement.querySelector('.round-announcement-image');
    if (!image || announcement.childElementCount !== 1) {
      announcement.innerHTML = '<img class="round-announcement-image" src="/images/The%20tide%20of%20the%20times.png" alt="時代浪潮" />';
    }
  }

  function patchTripleDice() {
    if (typeof currentRoom === 'undefined') return;
    const event = currentRoom?.game?.lastEvent;
    if (!event || !Array.isArray(event.dice) || event.dice.length !== 3) return;

    const overlay = document.querySelector('.action-showcase.dice-stage-active:not(.hidden)');
    if (!overlay) return;

    const images = overlay.querySelector('.dice-result-images');
    const image = overlay.querySelector('.dice-result-image');
    if (!images || !image) return;

    const total = Number(event.diceTotal || 0);
    const patchKey = `${currentRoom?.game?.turnId || ''}:${total}`;

    // 三骰只修正一次。dice-animation.js 之後會接管 image.src 播放 3roll1~5，
    // 不能在動畫 class 變化時反覆把 src 改回最終結果，否則手機端容易產生 observer 競態。
    if (image.dataset.tripleDicePatchKey === patchKey) return;

    images.classList.remove('double-dice-total', 'single-dice');
    images.classList.add('triple-dice-total');
    image.src = `/images/3-${total}.png`;
    image.alt = `三骰合計 ${total}`;
    image.dataset.tripleDicePatchKey = patchKey;
  }

  function patchSpecialResult() {
    if (typeof currentRoom === 'undefined') return;
    const room = currentRoom;
    const game = room?.game;
    const event = game?.lastEvent;
    if (!event || !['fate', 'sabotage', 'help'].includes(event.type)) return;

    const overlay = document.querySelector('.action-showcase.result-stage-active:not(.hidden)');
    const body = document.getElementById('actionShowcaseBody');
    if (!overlay || !body) return;

    const key = `${game.turnId || ''}:${game.showcaseUntil || ''}:${event.type}:${event.fateIndex ?? ''}:${event.targetId || ''}`;
    if (body.dataset.specialLayoutKey === key) return;

    const actor = room.players.find((player) => player.id === event.playerId);
    const target = room.players.find((player) => player.id === event.targetId);

    if (event.type === 'fate') {
      const eventImage = FATE_IMAGES[Number(event.fateIndex)] || '/images/destiny.png';
      body.innerHTML = `
        <div class="special-result-layout fate-result-layout">
          <div class="special-result-top">
            <img class="special-result-head" src="${headFor(actor)}" alt="${escapeHtml(actor?.name || '玩家')}" />
            <div class="special-result-description">${escapeHtml(event.text || '')}</div>
          </div>
          <img class="special-result-event-image" src="${eventImage}" alt="命運事件" />
        </div>
      `;
    } else if (target) {
      body.innerHTML = `
        <div class="special-result-layout target-only-result-layout">
          <div class="special-result-top">
            <img class="special-result-head" src="${headFor(target)}" alt="${escapeHtml(target.name)}" />
            <div class="special-result-description">${escapeHtml(targetEffectText(event, target))}</div>
          </div>
        </div>
      `;
    }

    body.dataset.specialLayoutKey = key;
  }

  function sync() {
    patchRoundAnnouncement();
    patchTripleDice();
    patchSpecialResult();
  }

  const observer = new MutationObserver(sync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // action-showcase 的 room:update listener 比這支檔案更早註冊，
  // 所以這裡同步執行可在 dice-animation MutationObserver 開始前先完成三骰修正。
  socket.on('room:update', sync);
  window.addEventListener('pageshow', sync);
})();
