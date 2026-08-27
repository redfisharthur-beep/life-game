(() => {
  function roundDisplayedNumber(text) {
    const cleaned = String(text || '').replaceAll(',', '').trim();
    const number = Number(cleaned);
    if (!Number.isFinite(number)) return text;
    return Math.round(number).toLocaleString('zh-TW');
  }

  function updateWaitingRoom() {
    const startButton = document.getElementById('startGameBtn');
    if (startButton && startButton.textContent.trim() === '等待房主啟程') {
      startButton.textContent = '等待中';
    }
  }

  function updatePlayerCards() {
    document.querySelectorAll('.player-info-cell.total-assets .player-info-value').forEach((valueEl) => {
      valueEl.textContent = roundDisplayedNumber(valueEl.textContent);
    });
  }

  function updateResults() {
    const resultWinner = document.getElementById('resultWinner');
    const results = document.getElementById('gameResults');
    if (!results || results.classList.contains('hidden')) return;

    if (resultWinner) {
      resultWinner.textContent = '🏆';
      resultWinner.setAttribute('aria-label', '第一名');
    }

    document.querySelectorAll('.ranking-card').forEach((card) => {
      const rankEl = card.querySelector('.ranking-number');
      if (rankEl) {
        const match = String(rankEl.textContent || '').match(/(\d+)/);
        const rank = Number(match?.[1] || 0);
        if (rank === 1) {
          rankEl.textContent = '🥇';
          rankEl.setAttribute('aria-label', '第一名');
        } else if (rank === 2) {
          rankEl.textContent = '🥈';
          rankEl.setAttribute('aria-label', '第二名');
        } else if (rank === 3) {
          rankEl.textContent = '🥉';
          rankEl.setAttribute('aria-label', '第三名');
        } else if (rank > 0) {
          rankEl.textContent = `第 ${rank} 名`;
        }
      }

      const totalAssetValue = card.querySelector('.ranking-stats > span:nth-child(2) b');
      if (totalAssetValue) {
        totalAssetValue.textContent = roundDisplayedNumber(totalAssetValue.textContent);
      }
    });
  }

  function applyTweaks() {
    updateWaitingRoom();
    updatePlayerCards();
    updateResults();
  }

  const observer = new MutationObserver(applyTweaks);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  socket.on('room:update', () => setTimeout(applyTweaks, 0));
  socket.on('room:started', () => setTimeout(applyTweaks, 0));
  setInterval(applyTweaks, 600);
  applyTweaks();
})();
