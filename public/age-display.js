(() => {
  const roundLabel = document.getElementById('roundLabel');
  if (!roundLabel) return;

  function renderAge() {
    if (typeof currentRoom === 'undefined' || !currentRoom?.game) return;
    const round = Number(currentRoom.game.round || 1);
    roundLabel.textContent = `${20 + round}歲`;
  }

  const observer = new MutationObserver(() => {
    const text = roundLabel.textContent || '';
    if (/^\d+\/\d+$/.test(text)) renderAge();
  });

  observer.observe(roundLabel, { childList: true, characterData: true, subtree: true });
  socket.on('room:update', renderAge);
  socket.on('room:started', renderAge);
  requestAnimationFrame(renderAge);
})();
