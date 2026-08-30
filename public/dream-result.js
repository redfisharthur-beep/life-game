(() => {
  const DREAM_IMAGES = {
    doctor: { happy: '/images/doctorhappy.png', cry: '/images/doctorcry.png' },
    engineer: { happy: '/images/engineerhappy.png', cry: '/images/engineercry.png' },
    sales: { happy: '/images/saleshappy.png', cry: '/images/salescry.png' },
    office: { happy: '/images/officehappy.png', cry: '/images/officecry.png' },
    athlete: { happy: '/images/athletehappy.png', cry: '/images/athletecry.png' },
    rich: { happy: '/images/richhappy.png', cry: '/images/richcry.png' },
    civilServant: { happy: '/images/civil%20servanthappy.png', cry: '/images/civil%20servantcry.png' },
    artist: { happy: '/images/artisthappy.png', cry: '/images/artistcry.png' },
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatSigned(value) {
    const number = Number(value || 0);
    if (Math.abs(number) < 0.000001) return '0';
    return `${number > 0 ? '+' : '-'}${Math.abs(number)}`;
  }

  function applyDreamResult() {
    if (typeof currentRoom === 'undefined') return;

    const room = currentRoom;
    const game = room?.game;
    const event = game?.lastEvent;
    if (!event || event.type !== 'dream') return;

    const overlay = document.querySelector('.action-showcase.result-stage-active:not(.hidden)');
    const body = document.getElementById('actionShowcaseBody');
    if (!overlay || !body) return;

    const actor = room.players?.find((player) => player.id === event.playerId);
    const imageSet = DREAM_IMAGES[actor?.profession];
    if (!imageSet) return;

    const success = Boolean(event.success);
    const image = success ? imageSet.happy : imageSet.cry;
    const title = success ? '圓夢成功' : '圓夢失敗';
    const name = actor?.name || '玩家';
    const key = `${game?.turnId || ''}:${game?.showcaseUntil || ''}:${event.playerId || ''}:${success ? 'happy' : 'cry'}`;
    if (body.dataset.dreamResultKey === key) return;

    const detail = success
      ? `幸福值 ${formatSigned(event.happinessGain)}`
      : `資金不足｜現金 ${formatSigned(event.salaryIncome)}`;

    body.innerHTML = `
      <div class="dream-result-layout ${success ? 'dream-result-success' : 'dream-result-fail'}">
        <img class="dream-result-image" src="${image}" alt="${escapeHtml(name)} ${title}" decoding="async" />
        <div class="dream-result-copy">
          <strong class="dream-result-title">${escapeHtml(name)} ${title}</strong>
          <span class="dream-result-detail">${escapeHtml(detail)}</span>
        </div>
      </div>
    `;
    body.dataset.dreamResultKey = key;
  }

  const showcase = document.querySelector('.action-showcase');
  if (showcase) {
    const observer = new MutationObserver(() => requestAnimationFrame(applyDreamResult));
    observer.observe(showcase, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  socket.on('room:update', () => requestAnimationFrame(applyDreamResult));
})();
