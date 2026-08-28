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

  function formatSigned(value) {
    const number = Number(value || 0);
    if (Math.abs(number) < 0.000001) return '0';
    return `${number > 0 ? '+' : '-'}${Math.abs(number)}`;
  }

  function setEffects(row, effects) {
    const container = row?.querySelector('.simple-result-effects');
    if (!container) return;
    container.innerHTML = effects
      .map((effect) => `<span class="simple-result-effect">${effect}</span>`)
      .join('');
  }

  function simplifyDreamFail(overlay, event) {
    if (event.type !== 'dream' || event.success) return;
    const row = overlay.querySelector('.simple-result-row');
    if (!row) return;
    setEffects(row, [`現金 +${Number(event.salaryIncome || 0)}`]);
  }

  function syncHelpActorRewards(overlay, event) {
    if (event.type !== 'help') return;
    const rows = [...overlay.querySelectorAll('.simple-result-row')];
    const actorRow = rows.at(-1);
    if (!actorRow) return;
    setEffects(actorRow, [`現金 ${formatSigned(event.bonus)}`]);
  }

  function syncFateResult(overlay, event) {
    if (event.type !== 'fate') return;
    const row = overlay.querySelector('.simple-result-row');
    if (!row) return;

    const fateIndex = Number(event.fateIndex);
    if (fateIndex === 0 || fateIndex === 1) {
      setEffects(row, [`現金 ${formatSigned(event.amount)}`]);
    } else if (fateIndex === 2 || fateIndex === 3) {
      setEffects(row, [`股票 ${formatSigned(event.units)}`]);
    } else if (fateIndex === 4 || fateIndex === 5) {
      setEffects(row, [`土地 ${formatSigned(event.units)}`]);
    } else if (fateIndex === 6) {
      setEffects(row, [`現金 ${formatSigned(event.received)}`]);
    } else if (fateIndex === 7 || fateIndex === 8) {
      setEffects(row, [`幸福值 ${formatSigned(event.happinessChange)}`]);
    }
  }

  function applySpecialResultVisual() {
    if (applying) return;
    applying = true;

    try {
      const overlay = document.querySelector('.action-showcase.result-stage-active:not(.hidden)');
      if (!overlay || typeof currentRoom === 'undefined') return;

      const event = currentRoom?.game?.lastEvent;
      if (!event) return;

      simplifyDreamFail(overlay, event);
      syncHelpActorRewards(overlay, event);
      syncFateResult(overlay, event);

      if (!['sabotage', 'help'].includes(event.type)) return;

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