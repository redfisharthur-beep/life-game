(() => {
  function roundDisplayedNumber(text) {
    const cleaned = String(text || '').replaceAll(',', '').trim();
    const number = Number(cleaned);
    if (!Number.isFinite(number)) return text;
    return Math.round(number).toLocaleString('zh-TW');
  }

  function setTextIfChanged(element, text) {
    if (!element) return;
    const next = String(text);
    if (element.textContent !== next) element.textContent = next;
  }

  function updateWaitingRoom() {
    const startButton = document.getElementById('startGameBtn');
    if (startButton && startButton.textContent.trim() === '等待房主啟程') {
      setTextIfChanged(startButton, '等待中');
    }
  }

  function updatePlayerCards() {
    document.querySelectorAll('.player-info-cell.total-assets .player-info-value').forEach((valueEl) => {
      setTextIfChanged(valueEl, roundDisplayedNumber(valueEl.textContent));
    });
  }

  function updateResults() {
    const resultWinner = document.getElementById('resultWinner');
    const results = document.getElementById('gameResults');
    if (!results || results.classList.contains('hidden')) return;

    if (resultWinner) {
      setTextIfChanged(resultWinner, '🏆');
      if (resultWinner.getAttribute('aria-label') !== '第一名') {
        resultWinner.setAttribute('aria-label', '第一名');
      }
    }

    document.querySelectorAll('.ranking-card').forEach((card) => {
      const rankEl = card.querySelector('.ranking-number');
      if (rankEl) {
        const rawRank = Number(rankEl.dataset.rank || String(rankEl.textContent || '').match(/(\d+)/)?.[1] || 0);
        if (rawRank > 0) rankEl.dataset.rank = String(rawRank);

        if (rawRank === 1) {
          setTextIfChanged(rankEl, '🥇');
          if (rankEl.getAttribute('aria-label') !== '第一名') rankEl.setAttribute('aria-label', '第一名');
        } else if (rawRank === 2) {
          setTextIfChanged(rankEl, '🥈');
          if (rankEl.getAttribute('aria-label') !== '第二名') rankEl.setAttribute('aria-label', '第二名');
        } else if (rawRank === 3) {
          setTextIfChanged(rankEl, '🥉');
          if (rankEl.getAttribute('aria-label') !== '第三名') rankEl.setAttribute('aria-label', '第三名');
        } else if (rawRank > 0) {
          setTextIfChanged(rankEl, `第 ${rawRank} 名`);
        }
      }

      const totalAssetValue = card.querySelector('.ranking-stats > span:nth-child(2) b');
      if (totalAssetValue) {
        setTextIfChanged(totalAssetValue, roundDisplayedNumber(totalAssetValue.textContent));
      }
    });
  }

  function applyTweaks() {
    updateWaitingRoom();
    updatePlayerCards();
    updateResults();
  }

  socket.on('room:update', () => setTimeout(applyTweaks, 0));
  socket.on('room:started', () => setTimeout(applyTweaks, 0));
  window.addEventListener('pageshow', () => setTimeout(applyTweaks, 0));
  applyTweaks();
})();
