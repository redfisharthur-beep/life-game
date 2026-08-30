(() => {
  if (typeof socket === 'undefined') return;

  // 首頁後新增「房間列表」層，沿用 Player List.png；真正進房後才顯示玩家列表。
  if (!document.getElementById('roomBrowserPanel')) {
    const panel = document.createElement('div');
    panel.id = 'roomBrowserPanel';
    panel.className = 'panel room-browser-panel hidden';
    panel.innerHTML = `
      <div class="room-browser-stage">
        <img class="room-browser-bg" src="/images/Player%20List.png?v=20260827-1905" alt="房間列表" />
        <div class="room-browser-overlay">
          <h2 class="room-browser-title">房間列表</h2>
          <div id="roomBrowserList" class="room-browser-list" aria-live="polite"></div>
          <div class="room-browser-actions">
            <button id="createRoomBtn" class="room-browser-action primary" type="button">建立我的房間</button>
            <button id="refreshRoomsBtn" class="room-browser-action" type="button">重新整理</button>
            <button id="roomBrowserBackBtn" class="room-browser-action" type="button">返回首頁</button>
          </div>
          <p id="roomBrowserMessage" class="room-browser-message" aria-live="polite"></p>
        </div>
      </div>
    `;

    const roomPanel = document.getElementById('roomPanel');
    if (roomPanel) roomPanel.before(panel);
    else document.getElementById('lobbyCard')?.appendChild(panel);
  }

  if (!document.querySelector('link[data-room-browser-style]')) {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/room-browser.css?v=20260830-1815';
    style.dataset.roomBrowserStyle = '1';
    document.head.appendChild(style);
  }

  if (!document.querySelector('script[data-room-browser-script]')) {
    const script = document.createElement('script');
    script.src = '/room-browser.js?v=20260830-1815';
    script.dataset.roomBrowserScript = '1';
    document.body.appendChild(script);
  }

  socket.on('disconnect', () => {
    if (typeof currentRoom === 'undefined' || currentRoom?.phase !== 'lobby') return;

    socket.abandonRoom?.();
    if (typeof clearSession === 'function') clearSession();
    currentRoom = null;

    document.getElementById('roomBrowserPanel')?.classList.add('hidden');
    if (typeof showPanel === 'function' && typeof entryPanel !== 'undefined') {
      showPanel(entryPanel);
    }
    document.getElementById('homeStage')?.classList.add('home-visible');
    document.getElementById('lobbyCard')?.classList.add('home-mode');
    if (typeof setMessage === 'function') {
      setMessage('連線已中斷，請重新輸入名字加入遊戲');
    }
  });
})();
