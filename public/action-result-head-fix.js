(() => {
  const RESULT_HEAD_IMAGES = {
    civilServant: '/images/civil%20servanthead.png',
    artist: '/images/artisthead.png',
  };

  const RESULT_FALLBACK_IMAGES = {
    civilServant: '/images/civil%20servant.png',
    artist: '/images/artist.png',
  };

  function findPlayerByName(name) {
    try {
      return (currentRoom?.players || []).find((player) => player?.name === name) || null;
    } catch (_) {
      return null;
    }
  }

  function fixResultHead(image) {
    if (!(image instanceof HTMLImageElement) || !image.classList.contains('result-person-head')) return;

    const playerName = image.alt?.trim();
    if (!playerName) return;

    const player = findPlayerByName(playerName);
    const professionId = player?.profession;
    const desired = RESULT_HEAD_IMAGES[professionId];
    if (!desired) return;

    const desiredUrl = new URL(desired, location.origin).href;
    if (image.src !== desiredUrl) image.src = desired;

    image.onerror = () => {
      const fallback = RESULT_FALLBACK_IMAGES[professionId];
      if (fallback) image.src = fallback;
      image.onerror = null;
    };
  }

  function scan(root = document) {
    if (root instanceof HTMLImageElement) fixResultHead(root);
    root.querySelectorAll?.('img.result-person-head').forEach(fixResultHead);
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) scan(node);
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
