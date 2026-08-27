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
    const showOnRoom = isVisible(roomPanel);
    const showOnProfession = isVisible(professionPanel);
    const showOnResults = isVisible(gamePanel) && gamePanel.classList.contains('finished-mode');

    if (homeStage) {
      homeStage.classList.toggle('home-visible', showOnHome);
    }

    if (mainCard) {
      mainCard.classList.toggle('home-mode', showOnHome);
      mainCard.classList.toggle('room-mode', showOnRoom);
      mainCard.classList.toggle('profession-mode', showOnProfession);
    }

    if (logo) {
      /* 首頁、等待頁、職業頁都有完整底圖；Logo 只保留結算畫面。 */
      logo.style.setProperty('display', showOnResults ? 'block' : 'none', 'important');
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
