(() => {
  const overlay = document.createElement('section');
  overlay.className = 'major-event-overlay hidden';
  overlay.setAttribute('aria-live', 'assertive');
  overlay.innerHTML = `
    <div class="major-event-card">
      <div class="major-event-kicker">重大事件</div>
      <h2 class="major-event-title"></h2>
      <p class="major-event-description"></p>
      <div class="major-event-countdown"><span>10</span> 秒</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const titleEl = overlay.querySelector('.major-event-title');
  const descriptionEl = overlay.querySelector('.major-event-description');
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

    const key = `${room.code}:${event.id}:${event.round}`;
    if (key !== activeKey) {
      activeKey = key;
      localDeadline = Date.now() + remaining;
      titleEl.textContent = event.title || '重大事件';
      descriptionEl.textContent = event.description || '';
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
