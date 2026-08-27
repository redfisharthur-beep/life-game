(() => {
  const logo = document.getElementById('gameLogo');
  const entryPanel = document.getElementById('entryPanel');
  const roomPanel = document.getElementById('roomPanel');
  const professionPanel = document.getElementById('professionPanel');
  const gamePanel = document.getElementById('gamePanel');

  if (!logo) return;

  const isVisible = (element) => Boolean(element && !element.classList.contains('hidden'));

  function updateLogoVisibility() {
    const showOnHome = isVisible(entryPanel);
    const showOnProfession = isVisible(professionPanel);
    const showOnResults = isVisible(gamePanel) && gamePanel.classList.contains('finished-mode');
    const shouldShow = showOnHome || showOnProfession || showOnResults;

    logo.style.setProperty('display', shouldShow ? 'block' : 'none', 'important');
  }

  const observer = new MutationObserver(updateLogoVisibility);
  [entryPanel, roomPanel, professionPanel, gamePanel]
    .filter(Boolean)
    .forEach((element) => {
      observer.observe(element, {
        attributes: true,
        attributeFilter: ['class'],
      });
    });

  updateLogoVisibility();
})();
