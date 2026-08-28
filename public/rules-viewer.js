(() => {
  const openBtn = document.getElementById('rulesOpenBtn');
  const viewer = document.getElementById('rulesViewer');
  const closeBtn = document.getElementById('rulesCloseBtn');
  const restartBtn = document.getElementById('restartGameBtn');
  const professionHomeBtn = document.getElementById('professionHomeBtn');
  const scrollArea = viewer?.querySelector('.rules-viewer-page');

  function syncRestartLabel() {
    if (!restartBtn) return;
    restartBtn.textContent = '再來一局';
  }

  if (restartBtn) {
    syncRestartLabel();
    if (typeof socket !== 'undefined') {
      socket.on('room:update', () => requestAnimationFrame(syncRestartLabel));
      socket.on('room:started', () => requestAnimationFrame(syncRestartLabel));
    }
  }

  if (professionHomeBtn && typeof socket !== 'undefined') {
    professionHomeBtn.addEventListener('click', () => {
      professionHomeBtn.disabled = true;
      socket.emit('room:leave', () => {
        if (typeof clearSession === 'function') clearSession();
        if (typeof showEntry === 'function') showEntry();
        professionHomeBtn.disabled = false;
      });
    });
  }

  if (!openBtn || !viewer || !closeBtn) return;

  function openViewer() {
    viewer.classList.remove('hidden');
    viewer.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    if (scrollArea) {
      scrollArea.scrollTop = 0;
      scrollArea.scrollLeft = 0;
    }
    closeBtn.focus({ preventScroll: true });
  }

  function closeViewer() {
    viewer.classList.add('hidden');
    viewer.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    openBtn.focus({ preventScroll: true });
  }

  openBtn.addEventListener('click', openViewer);
  closeBtn.addEventListener('click', closeViewer);

  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) closeViewer();
  });

  document.addEventListener('keydown', (event) => {
    if (viewer.classList.contains('hidden')) return;
    if (event.key === 'Escape') closeViewer();
  });
})();
