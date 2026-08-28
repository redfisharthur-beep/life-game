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
      <div class="major-event-countdown"><span>8</span></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const imageEl = overlay.querySelector('.major-event-image');
  const countdownEl = overlay.querySelector('.major-event-countdown span');
  let timer = null;
  let activeKey = null;
  let localDeadline = 0;

  function hide() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    activeKey = null;
    localDeadline = 0;
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
      localDeadline = Date.now() + remaining;
      imageEl.src = imageSrc;
      imageEl.alt = '';
      overlay.classList.remove('hidden');
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        const localRemaining = Math.max(0, localDeadline - Date.now());
        countdownEl.textContent = String(Math.max(0, Math.ceil(localRemaining / 1000)));
        if (localRemaining <= 0) hide();
      }, 200);
    } else {
      localDeadline = Date.now() + remaining;
    }

    countdownEl.textContent = String(Math.max(0, Math.ceil(remaining / 1000)));
  }

  socket.on('room:update', render);
})();
