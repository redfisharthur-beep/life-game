(() => {
  const entryPanel = document.getElementById('entryPanel');
  const roomBrowserPanel = document.getElementById('roomBrowserPanel');
  const roomBrowserList = document.getElementById('roomBrowserList');
  const roomBrowserMessage = document.getElementById('roomBrowserMessage');
  const roomBrowserActions = roomBrowserPanel?.querySelector('.room-browser-actions');
  const roomBrowserBackBtn = document.getElementById('roomBrowserBackBtn');
  const roomRulesOpenBtn = document.getElementById('roomRulesOpenBtn');
  const leaveRoomBtn = document.getElementById('leaveRoomBtn');
  const joinGameBtn = document.getElementById('joinGameBtn');
  const playerNameInput = document.getElementById('playerName');
  const homeStage = document.getElementById('homeStage');
  const lobbyCard = document.getElementById('lobbyCard');

  if (!entryPanel || !roomBrowserPanel || !roomBrowserList || !roomBrowserBackBtn || !joinGameBtn || !playerNameInput) return;

  let roomBrowserRulesBtn = document.getElementById('roomBrowserRulesBtn');
  if (!roomBrowserRulesBtn && roomBrowserActions) {
    roomBrowserRulesBtn = document.createElement('button');
    roomBrowserRulesBtn.id = 'roomBrowserRulesBtn';
    roomBrowserRulesBtn.className = 'room-browser-action';
    roomBrowserRulesBtn.type = 'button';
    roomBrowserRulesBtn.setAttribute('aria-label', '遊戲規則');
    roomBrowserRulesBtn.title = '遊戲規則';
    roomBrowserActions.appendChild(roomBrowserRulesBtn);
  }

  let loading = false;

  function currentName() {
    return playerNameInput.value.trim();
  }

  function setBrowserMessage(text = '', type = '') {
    if (!roomBrowserMessage) return;
    roomBrowserMessage.textContent = text;
    roomBrowserMessage.className = `room-browser-message ${type}`.trim();
  }

  function hideGamePanels() {
    ['entryPanel', 'roomPanel', 'professionPanel', 'gamePanel'].forEach((id) => {
      document.getElementById(id)?.classList.add('hidden');
    });
  }

  function showBrowser() {
    hideGamePanels();
    homeStage?.classList.remove('home-visible');
    lobbyCard?.classList.remove('home-mode', 'room-mode', 'game-mode');
    lobbyCard?.classList.add('room-browser-mode');
    roomBrowserPanel.classList.remove('hidden');
  }

  function hideBrowser() {
    roomBrowserPanel.classList.add('hidden');
    lobbyCard?.classList.remove('room-browser-mode');
  }

  function showEntry() {
    hideBrowser();
    entryPanel.classList.remove('hidden');
    homeStage?.classList.add('home-visible');
    lobbyCard?.classList.remove('room-mode', 'game-mode');
    lobbyCard?.classList.add('home-mode');
  }

  function setBusy(busy) {
    loading = busy;
    roomBrowserBackBtn.disabled = busy;
    if (roomBrowserRulesBtn) roomBrowserRulesBtn.disabled = busy;
    roomBrowserList.querySelectorAll('button').forEach((button) => {
      button.disabled = busy || button.dataset.available === 'false';
    });
  }

  async function fetchRooms(background = false) {
    if (loading) return;
    if (!background) {
      setBusy(true);
      setBrowserMessage('');
    }
    try {
      const response = await fetch('/api/rooms', { cache: 'no-store' });
      const result = await response.json();
      if (!result?.ok) throw new Error(result?.message || '讀取房間失敗');
      renderRooms(result.rooms || []);
    } catch (error) {
      console.error('load rooms failed', error);
      // 背景更新失敗時保留上一份畫面，不要整頁閃成錯誤訊息。
      if (!background && !roomBrowserList.children.length) {
        roomBrowserList.innerHTML = '<div class="room-browser-empty">房間列表讀取失敗</div>';
      }
    } finally {
      if (!background) setBusy(false);
    }
  }

  function findRoomButton(code) {
    return Array.from(roomBrowserList.querySelectorAll('.room-browser-item'))
      .find((button) => button.dataset.roomCode === code) || null;
  }

  function createRoomButton(code) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'room-browser-item';
    button.dataset.roomCode = code;

    const identity = document.createElement('span');
    identity.className = 'room-browser-identity';

    const title = document.createElement('strong');
    title.className = 'room-browser-name';
    identity.appendChild(title);

    const count = document.createElement('span');
    count.className = 'room-browser-count';

    button.append(identity, count);
    button.addEventListener('click', () => {
      if (button.dataset.available !== 'false') joinRoom(button.dataset.roomCode);
    });
    return button;
  }

  function renderRooms(rooms) {
    const seen = new Set();
    roomBrowserList.querySelector('.room-browser-empty')?.remove();

    rooms.forEach((room) => {
      const code = String(room.code || '');
      if (!code) return;
      seen.add(code);

      const available = room.available !== false;
      const button = findRoomButton(code) || createRoomButton(code);
      const identity = button.querySelector('.room-browser-identity');
      const title = button.querySelector('.room-browser-name');
      const count = button.querySelector('.room-browser-count');

      button.dataset.roomCode = code;
      button.dataset.available = String(available);
      button.disabled = !available;
      button.classList.toggle('unavailable', !available);

      const nextTitle = `${room.icon || '✨'} ${room.name || room.code}`;
      if (title && title.textContent !== nextTitle) title.textContent = nextTitle;

      let hostText = '';
      if (room.started) hostText = '遊戲進行中';
      else if (room.full) hostText = '房間已滿';
      else if (room.hostName) hostText = `房主：${room.hostName}`;

      let host = identity?.querySelector('.room-browser-host');
      if (hostText) {
        if (!host && identity) {
          host = document.createElement('span');
          host.className = 'room-browser-host';
          identity.appendChild(host);
        }
        if (host && host.textContent !== hostText) host.textContent = hostText;
      } else {
        host?.remove();
      }

      const nextCount = `${Number(room.count || 0)} / ${Number(room.maxPlayers || 6)}`;
      if (count && count.textContent !== nextCount) count.textContent = nextCount;

      // appendChild 對既有節點只會維持/調整順序，不會銷毀重建，因此沒有閃爍。
      roomBrowserList.appendChild(button);
    });

    roomBrowserList.querySelectorAll('.room-browser-item').forEach((button) => {
      if (!seen.has(button.dataset.roomCode)) button.remove();
    });
  }

  async function enterRoom(result) {
    if (!result?.ok || !result?.session) return;

    saveSession(result.session);
    localStorage.setItem('lifeGame.playerName', currentName());

    socket.emit('room:resume', result.session, (resumeResult) => {
      if (!resumeResult?.ok) {
        clearSession();
        fetchRooms();
        return;
      }
      hideBrowser();
      saveSession(resumeResult.session || result.session);
      renderByPhase(resumeResult.room || result.room);
    });
  }

  async function postRoom(path, payload) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  async function joinRoom(code) {
    if (loading) return;
    const name = currentName();
    if (!name) {
      showEntry();
      setMessage('請先輸入名字', 'error');
      return;
    }

    setBusy(true);
    try {
      const result = await postRoom('/api/join-room', { code, name });
      if (!result?.ok) {
        await fetchRooms();
        return;
      }
      await enterRoom(result);
    } catch (error) {
      console.error('join room failed', error);
    } finally {
      setBusy(false);
    }
  }

  function openRoomBrowser(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    const name = currentName();
    if (!name) {
      setMessage('請先輸入名字', 'error');
      return;
    }

    localStorage.setItem('lifeGame.playerName', name);
    setMessage('');
    showBrowser();
    fetchRooms();
  }

  function leaveLobbyToRoomBrowser(event) {
    if (typeof currentRoom === 'undefined' || currentRoom?.phase !== 'lobby') return;
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (!leaveRoomBtn || leaveRoomBtn.disabled) return;

    leaveRoomBtn.disabled = true;
    socket.emit('room:leave', {}, () => {
      if (typeof clearSession === 'function') clearSession();
      if (typeof currentRoom !== 'undefined') currentRoom = null;
      leaveRoomBtn.disabled = false;
      showBrowser();
      fetchRooms();
    });
  }

  joinGameBtn.addEventListener('click', openRoomBrowser, true);
  playerNameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    openRoomBrowser(event);
  }, true);

  leaveRoomBtn?.addEventListener('click', leaveLobbyToRoomBrowser, true);

  roomBrowserBackBtn.addEventListener('click', () => {
    setBrowserMessage('');
    showEntry();
  });

  roomBrowserRulesBtn?.addEventListener('click', () => {
    document.getElementById('rulesOpenBtn')?.click();
  });

  roomRulesOpenBtn?.setAttribute('title', '遊戲規則');

  setInterval(() => {
    if (!roomBrowserPanel.classList.contains('hidden') && !loading) fetchRooms(true);
  }, 4000);
})();
