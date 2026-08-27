(() => {
  const logo = document.getElementById('gameLogo');
  const homeStage = document.getElementById('homeStage');
  const mainCard = document.getElementById('lobbyCard');
  const entryPanel = document.getElementById('entryPanel');
  const roomPanel = document.getElementById('roomPanel');
  const professionPanel = document.getElementById('professionPanel');
  const gamePanel = document.getElementById('gamePanel');

  const isVisible = (element) => Boolean(element && !element.classList.contains('hidden'));

  function updateVisualState() {
    const showOnHome = isVisible(entryPanel);
    const showOnProfession = isVisible(professionPanel);
    const showOnResults = isVisible(gamePanel) && gamePanel.classList.contains('finished-mode');

    if (homeStage) {
      homeStage.classList.toggle('home-visible', showOnHome);
    }

    if (mainCard) {
      mainCard.classList.toggle('home-mode', showOnHome);
    }

    if (logo) {
      const shouldShowLogo = showOnProfession || showOnResults;
      logo.style.setProperty('display', shouldShowLogo ? 'block' : 'none', 'important');
    }
  }

  const observer = new MutationObserver(updateVisualState);
  [entryPanel, roomPanel, professionPanel, gamePanel]
    .filter(Boolean)
    .forEach((element) => {
      observer.observe(element, {
        attributes: true,
        attributeFilter: ['class'],
      });
    });

  updateVisualState();
})();
