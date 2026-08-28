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

  const FATE_RESULTS = [
    POSITIVE_RESULTS[0],
    NEGATIVE_RESULTS[0],
    POSITIVE_RESULTS[1],
    NEGATIVE_RESULTS[1],
    POSITIVE_RESULTS[2],
    NEGATIVE_RESULTS[2],
    { label: '社福救濟', image: '/images/Social%20welfare.png' },
    POSITIVE_RESULTS[3],
    NEGATIVE_RESULTS[3],
  ];

  const DRAW_MS = 1500;
  const DRAW_FRAME_MS = 250;

  let applying = false;
  let carouselKey = null;
  let carouselInterval = null;
  let carouselFinalTimer = null;

  function clearCarousel() {
    if (carouselInterval) {
      clearInterval(carouselInterval);
      carouselInterval = null;
    }
    if (carouselFinalTimer) {
      clearTimeout(carouselFinalTimer);
      carouselFinalTimer = null;
    }
    carouselKey = null;
  }

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
    setEffects(actorRow, [
      `現金 ${formatSigned(event.bonus)}`,
      '幸福值 +0.7',
    ]);
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

  function getPoolAndFinal(event) {
    if (event.type === 'fate') {
      const index = Math.max(0, Math.min(FATE_RESULTS.length - 1, Number(event.fateIndex) || 0));
      return { pool: FATE_RESULTS, final: FATE_RESULTS[index] };
    }
    if (event.type === 'sabotage') {
      const index = Math.max(0, Math.min(3, Number(event.effectIndex) || 0));
      return { pool: NEGATIVE_RESULTS, final: NEGATIVE_RESULTS[index] };
    }
    if (event.type === 'help') {
      const index = Math.max(0, Math.min(3, Number(event.effectIndex) || 0));
      return { pool: POSITIVE_RESULTS, final: POSITIVE_RESULTS[index] };
    }
    return null;
  }

  function setEventVisual(overlay, result) {
    const eventImage = overlay.querySelector('.result-event-image');
    const eventLabel = overlay.querySelector('.result-event-label');
    if (eventImage) {
      eventImage.src = result.image;
      eventImage.alt = result.label;
    }
    if (eventLabel) eventLabel.textContent = result.label;
  }

  function normalizeSabotageHelpVisual(overlay, event, finalResult) {
    if (!['sabotage', 'help'].includes(event.type)) return;
    const visual = overlay.querySelector('.result-visual');
    if (!visual) return;

    visual.classList.remove('result-visual-dual');
    visual.classList.add('result-visual-actor-event');

    const people = [...visual.querySelectorAll('.result-person')];
    people.slice(1).forEach((person) => person.remove());

    const actorHead = visual.querySelector('.result-person-head');
    if (actorHead) actorHead.classList.remove('result-person-head-small');

    setEventVisual(overlay, finalResult);
  }

  function startDrawCarousel(overlay, event) {
    const config = getPoolAndFinal(event);
    if (!config) {
      clearCarousel();
      return;
    }

    const roomCode = typeof currentRoom !== 'undefined' ? currentRoom?.code : '';
    const turnId = typeof currentRoom !== 'undefined' ? currentRoom?.game?.turnId : '';
    const key = `${roomCode}:${turnId}:${event.type}:${event.fateIndex ?? event.effectIndex ?? ''}`;
    if (carouselKey === key) return;

    clearCarousel();
    carouselKey = key;

    let frame = 0;
    const showFrame = () => {
      const result = config.pool[frame % config.pool.length];
      setEventVisual(overlay, result);
      frame += 1;
    };

    showFrame();
    carouselInterval = setInterval(showFrame, DRAW_FRAME_MS);

    carouselFinalTimer = setTimeout(() => {
      if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
      }
      setEventVisual(overlay, config.final);
      carouselFinalTimer = null;
      // 結果階段共 3.5 秒：前 1.5 秒抽圖輪播，最後結果自然定格 2 秒。
    }, DRAW_MS);
  }

  function applySpecialResultVisual() {
    if (applying) return;
    applying = true;

    try {
      const overlay = document.querySelector('.action-showcase.result-stage-active:not(.hidden)');
      if (!overlay || typeof currentRoom === 'undefined') {
        clearCarousel();
        return;
      }

      const event = currentRoom?.game?.lastEvent;
      if (!event) {
        clearCarousel();
        return;
      }

      simplifyDreamFail(overlay, event);
      syncHelpActorRewards(overlay, event);
      syncFateResult(overlay, event);

      const config = getPoolAndFinal(event);
      if (!config) {
        clearCarousel();
        return;
      }

      normalizeSabotageHelpVisual(overlay, event, config.final);
      startDrawCarousel(overlay, event);
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearCarousel();
  });
})();