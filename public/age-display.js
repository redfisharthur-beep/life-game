(() => {
  const roundLabel = document.getElementById('roundLabel');
  if (!roundLabel) return;

  function expectedAgeText() {
    if (typeof currentRoom === 'undefined' || !currentRoom?.game) return null;
    const round = Math.max(1, Math.min(30, Number(currentRoom.game.round || 1)));
    return `${20 + round}歲`;
  }

  function renderAge() {
    const expected = expectedAgeText();
    if (!expected) return;
    if (roundLabel.textContent !== expected) roundLabel.textContent = expected;
  }

  const observer = new MutationObserver(renderAge);
  observer.observe(roundLabel, { childList: true, characterData: true, subtree: true });
  socket.on('room:update', renderAge);
  socket.on('room:started', renderAge);
  requestAnimationFrame(renderAge);
})();
