(() => {
  const openBtn = document.getElementById('rulesOpenBtn');
  const viewer = document.getElementById('rulesViewer');
  const closeBtn = document.getElementById('rulesCloseBtn');
  const restartBtn = document.getElementById('restartGameBtn');
  const professionHomeBtn = document.getElementById('professionHomeBtn');
  const scrollArea = viewer?.querySelector('.rules-viewer-page');

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;
  let zoom = 1;
  let touchMode = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragScrollLeft = 0;
  let dragScrollTop = 0;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;

  function syncRestartLabel() {
    if (!restartBtn) return;
    restartBtn.textContent = '再來一局';
  }

  function clampZoom(value) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  }

  function applyZoom(nextZoom, centerX = null, centerY = null) {
    if (!scrollArea) return;

    const previousZoom = zoom;
    const next = clampZoom(nextZoom);
    if (Math.abs(next - previousZoom) < 0.001) return;

    const rect = scrollArea.getBoundingClientRect();
    const localX = centerX == null ? rect.width / 2 : centerX - rect.left;
    const localY = centerY == null ? rect.height / 2 : centerY - rect.top;
    const contentX = (scrollArea.scrollLeft + localX) / previousZoom;
    const contentY = (scrollArea.scrollTop + localY) / previousZoom;

    zoom = next;
    scrollArea.style.setProperty('--rules-zoom', String(zoom));

    requestAnimationFrame(() => {
      scrollArea.scrollLeft = contentX * zoom - localX;
      scrollArea.scrollTop = contentY * zoom - localY;
    });
  }

  function resetViewerPosition() {
    zoom = 1;
    if (!scrollArea) return;
    scrollArea.style.setProperty('--rules-zoom', '1');
    scrollArea.scrollTop = 0;
    scrollArea.scrollLeft = 0;
  }

  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function touchCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }

  function syncRestartSetup() {
    if (restartBtn) {
      syncRestartLabel();
      if (typeof socket !== 'undefined') {
        socket.on('room:update', () => requestAnimationFrame(syncRestartLabel));
        socket.on('room:started', () => requestAnimationFrame(syncRestartLabel));
      }
    }
  }

  syncRestartSetup();

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
    resetViewerPosition();
    closeBtn.focus({ preventScroll: true });
  }

  function closeViewer() {
    viewer.classList.add('hidden');
    viewer.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    touchMode = null;
    scrollArea?.classList.remove('is-dragging');
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

  if (scrollArea) {
    scrollArea.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      applyZoom(zoom + direction * 0.15, event.clientX, event.clientY);
    }, { passive: false });

    scrollArea.addEventListener('dblclick', (event) => {
      event.preventDefault();
      applyZoom(zoom > 1.01 ? 1 : 2, event.clientX, event.clientY);
    });

    scrollArea.addEventListener('touchstart', (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        touchMode = 'pinch';
        pinchStartDistance = touchDistance(event.touches);
        pinchStartZoom = zoom;
        scrollArea.classList.remove('is-dragging');
      } else if (event.touches.length === 1) {
        touchMode = 'drag';
        dragStartX = event.touches[0].clientX;
        dragStartY = event.touches[0].clientY;
        dragScrollLeft = scrollArea.scrollLeft;
        dragScrollTop = scrollArea.scrollTop;
        scrollArea.classList.add('is-dragging');
      }
    }, { passive: false });

    scrollArea.addEventListener('touchmove', (event) => {
      if (touchMode === 'pinch' && event.touches.length === 2) {
        event.preventDefault();
        const center = touchCenter(event.touches);
        const ratio = touchDistance(event.touches) / Math.max(1, pinchStartDistance);
        applyZoom(pinchStartZoom * ratio, center.x, center.y);
      } else if (touchMode === 'drag' && event.touches.length === 1) {
        event.preventDefault();
        const dx = event.touches[0].clientX - dragStartX;
        const dy = event.touches[0].clientY - dragStartY;
        scrollArea.scrollLeft = dragScrollLeft - dx;
        scrollArea.scrollTop = dragScrollTop - dy;
      }
    }, { passive: false });

    scrollArea.addEventListener('touchend', (event) => {
      if (event.touches.length === 0) {
        touchMode = null;
        scrollArea.classList.remove('is-dragging');
      } else if (event.touches.length === 1) {
        touchMode = 'drag';
        dragStartX = event.touches[0].clientX;
        dragStartY = event.touches[0].clientY;
        dragScrollLeft = scrollArea.scrollLeft;
        dragScrollTop = scrollArea.scrollTop;
        scrollArea.classList.add('is-dragging');
      }
    }, { passive: false });
  }
})();
