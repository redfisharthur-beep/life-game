(() => {
  const NEGATIVE_RESULTS = [
    { label: '花錢消災', image: '/images/Spendmoney.png' },
    { label: '黑天鵝', image: '/images/Black%20Swan.png' },
    { label: '打房政策', image: '/images/measures%20to%20curb%20the%20property%20market.png' },
    { label: '人生低潮', image: '/images/Unlucky.png' },
  ];

  const POSITIVE_RESULTS = [
    { label: '中樂透', image: '/images/Lotto.png' },
    { label: '股神降臨', image: '/images/Investment%20Guru.png' },
    { label: '政策利多', image: '/images/Favorable%20policies.png' },
    { label: '幸福降臨', image: '/images/Unbelievable.png' },
  ];

  let applying = false;

  function applySpecialResultVisual() {
    if (applying) return;
    applying = true;

    try {
      const overlay = document.querySelector('.action-showcase.result-stage-active:not(.hidden)');
      if (!overlay || typeof currentRoom === 'undefined') return;

      const event = currentRoom?.game?.lastEvent;
      if (!event || !['sabotage', 'help'].includes(event.type)) return;

      const visual = overlay.querySelector('.result-visual');
      if (!visual) return;

      const effectIndex = Math.max(0, Math.min(3, Number(event.effectIndex) || 0));
      const result = event.type === 'sabotage'
        ? NEGATIVE_RESULTS[effectIndex]
        : POSITIVE_RESULTS[effectIndex];

      visual.classList.remove('result-visual-dual');
      visual.classList.add('result-visual-actor-event');

      const people = [...visual.querySelectorAll('.result-person')];
      people.slice(1).forEach((person) => person.remove());

      const actorHead = visual.querySelector('.result-person-head');
      if (actorHead) actorHead.classList.remove('result-person-head-small');

      const eventImage = visual.querySelector('.result-event-image');
      if (eventImage) {
        eventImage.src = result.image;
        eventImage.alt = result.label;
      }

      const eventLabel = visual.querySelector('.result-event-label');
      if (eventLabel) eventLabel.textContent = result.label;
    } finally {
      applying = false;
    }
  }

  const observer = new MutationObserver(() => {
    requestAnimationFrame(applySpecialResultVisual);
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  socket.on('room:update', () => requestAnimationFrame(applySpecialResultVisual));
})();
