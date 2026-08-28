(() => {
  const EVENT_IMAGES = {
    financialCrash: '/images/Financial%20crisis.png',
    earthquake: '/images/Major%20earthquake.png',
    inflation: '/images/Inflation.png',
    aiBoom: '/images/The%20AI%20revolution.png',
    urbanRenewal: '/images/Urban%20rezoning.png',
    eraWave: '/images/The%20tide%20of%20the%20times.png',
    happinessBoost: '/images/Double%20the%20happiness.png',
    cashGrant: '/images/Universal%20cash%20payouts.png',
  };

  const overlay = document.createElement('section');
  overlay.className = 'major-event-overlay hidden';
  overlay.setAttribute('aria-live', 'assertive');
  overlay.innerHTML = `
    <div class="major-event-card">
      <img class="major-event-image" src="" alt="" />
    </div>
  `;
  document.body.appendChild(overlay);

  const imageEl = overlay.querySelector('.major-event-image');
  let hideTimer = null;
  let activeKey = null;

  function hide() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    activeKey = null;
    imageEl.removeAttribute('src');
    imageEl.alt = '';
    overlay.classList.add('hidden');
  }

  function render(room) {
    const game = room?.game;
    const event = game?.majorEvent;
    const until = Number(game?.majorEventUntil || 0);
    const serverNow = Number(room?.serverTime || Date.now());
    const remaining = until - serverNow;

    if (!event || remaining <= 0 || room?.phase !== 'game') {
      hide();
      return;
    }

    const imageSrc = EVENT_IMAGES[event.id];
    if (!imageSrc) {
      hide();
      return;
    }

    const key = `${room.code}:${event.id}:${event.round}`;
    if (key !== activeKey) {
      activeKey = key;
      imageEl.src = imageSrc;
      imageEl.alt = '';
      overlay.classList.remove('hidden');
    }

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, Math.max(0, remaining));
  }

  socket.on('room:update', render);
})();
