(() => {
  const resultWinnerEl = document.getElementById('resultWinner');
  const rankingListEl = document.getElementById('rankingList');
  if (!resultWinnerEl || !rankingListEl) return;

  function syncWinnerProfession() {
    const winnerCards = [...rankingListEl.querySelectorAll('.ranking-card.winner')];
    if (!winnerCards.length) return;

    const professions = winnerCards
      .map((card) => card.querySelector('.ranking-identity span')?.textContent?.trim())
      .filter(Boolean);

    const uniqueProfessions = [...new Set(professions)];
    const professionText = uniqueProfessions.length
      ? uniqueProfessions.join('／')
      : '冠軍';

    resultWinnerEl.innerHTML = `
      <span class="winner-trophy" aria-hidden="true">🏆</span>
      <span class="winner-profession-name">${professionText}</span>
    `;
  }

  const observer = new MutationObserver(() => {
    requestAnimationFrame(syncWinnerProfession);
  });

  observer.observe(rankingListEl, { childList: true, subtree: true });
  syncWinnerProfession();
})();
