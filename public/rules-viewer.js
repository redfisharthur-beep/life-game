(() => {
  const openBtn = document.getElementById('rulesOpenBtn');
  const viewer = document.getElementById('rulesViewer');
  const image = document.getElementById('rulesViewerImage');
  const error = document.getElementById('rulesViewerError');
  const closeBtn = document.getElementById('rulesCloseBtn');
  const prevBtn = document.getElementById('rulesPrevBtn');
  const nextBtn = document.getElementById('rulesNextBtn');
  const indicator = document.getElementById('rulesPageIndicator');
  const restartBtn = document.getElementById('restartGameBtn');

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

  if (!openBtn || !viewer || !image || !closeBtn || !prevBtn || !nextBtn || !indicator) return;

  const base = '/images/';
  const pages = [
    [
      'rules1.png',
      '人生_玩法說明_幸福冒險指南.png',
      '人生_玩法說明_快速上手篇.png',
      'rule1.png',
    ],
    [
      'rules2.png',
      '人生_玩法說明_行動攻略篇.png',
      'rule2.png',
    ],
  ];

  let pageIndex = 0;
  let candidateIndex = 0;
  let touchStartX = null;

  function imageUrl(name) {
    return base + name.split('/').map(encodeURIComponent).join('/');
  }

  function updateControls() {
    indicator.textContent = `${pageIndex + 1} / ${pages.length}`;
    prevBtn.disabled = pageIndex <= 0;
    nextBtn.disabled = pageIndex >= pages.length - 1;
  }

  function loadCurrentPage() {
    candidateIndex = 0;
    viewer.classList.remove('error');
    if (error) error.textContent = '';
    updateControls();
    image.src = imageUrl(pages[pageIndex][candidateIndex]);
    image.alt = `遊戲規則第 ${pageIndex + 1} 頁`;
  }

  image.addEventListener('error', () => {
    candidateIndex += 1;
    if (candidateIndex < pages[pageIndex].length) {
      image.src = imageUrl(pages[pageIndex][candidateIndex]);
      return;
    }
    viewer.classList.add('error');
    if (error) error.textContent = `找不到遊戲規則第 ${pageIndex + 1} 頁圖檔，請確認圖片已上傳到 public/images。`;
  });

  image.addEventListener('load', () => {
    viewer.classList.remove('error');
  });

  function openViewer() {
    pageIndex = 0;
    loadCurrentPage();
    viewer.classList.remove('hidden');
    viewer.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    closeBtn.focus({ preventScroll: true });
  }

  function closeViewer() {
    viewer.classList.add('hidden');
    viewer.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    openBtn.focus({ preventScroll: true });
  }

  function goToPage(nextIndex) {
    if (nextIndex < 0 || nextIndex >= pages.length || nextIndex === pageIndex) return;
    pageIndex = nextIndex;
    loadCurrentPage();
  }

  openBtn.addEventListener('click', openViewer);
  closeBtn.addEventListener('click', closeViewer);
  prevBtn.addEventListener('click', () => goToPage(pageIndex - 1));
  nextBtn.addEventListener('click', () => goToPage(pageIndex + 1));

  viewer.addEventListener('click', (event) => {
    if (event.target === viewer) closeViewer();
  });

  viewer.addEventListener('touchstart', (event) => {
    touchStartX = event.touches?.[0]?.clientX ?? null;
  }, { passive: true });

  viewer.addEventListener('touchend', (event) => {
    if (touchStartX == null) return;
    const endX = event.changedTouches?.[0]?.clientX;
    if (typeof endX === 'number') {
      const delta = endX - touchStartX;
      if (Math.abs(delta) >= 45) goToPage(pageIndex + (delta < 0 ? 1 : -1));
    }
    touchStartX = null;
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (viewer.classList.contains('hidden')) return;
    if (event.key === 'Escape') closeViewer();
    else if (event.key === 'ArrowLeft') goToPage(pageIndex - 1);
    else if (event.key === 'ArrowRight') goToPage(pageIndex + 1);
  });
})();
