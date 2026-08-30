(() => {
  const entryPanel = document.getElementById('entryPanel');
  const roomBrowserPanel = document.getElementById('roomBrowserPanel');
  const roomBrowserList = document.getElementById('roomBrowserList');
  const roomBrowserMessage = document.getElementById('roomBrowserMessage');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');
  const roomBrowserBackBtn = document.getElementById('roomBrowserBackBtn');
  const joinGameBtn = document.getElementById('joinGameBtn');
  const playerNameInput = document.getElementById('playerName');

  if (!entryPanel || !roomBrowserPanel || !roomBrowserList || !joinGameBtn || !playerNameInput) return;

  let refreshTimer = null;
  let loading = false;

  function currentName() {
    return playerNameInput.value.trim();
  }

  function setBrowserMessage(text = '', type = '') {
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
    roomBrowserPanel.classList.remove('hidden');
  }

  function hideBrowser() {
    roomBrowserPanel.classList.add('hidden');
  }

  function showEntry() {
    hideBrowser();
    entryPanel.classList.remove('hidden');
  }

  function setBusy(busy) {
    loading = busy;
    createRoomBtn.disabled = busy;
    refreshRoomsBtn.disabled = busy;
    roomBrowserBackBtn.disabled = busy;
    roomBrowserList.querySelectorAll('button').forEach((button) => {
      button.disabled = busy;
    });
  }

  async function fetchRooms() {
    if (loading) return;
    setBusy(true);
    setBrowserMessage('正在更新房間列表…');
    try {
      const response = await fetch('/api/rooms', { cache: 'no-store' });
      const result = await response.json();
      if (!result?.ok) throw new Error(result?.message || '讀取房間失敗');
      renderRooms(result.rooms || []);
      setBrowserMessage(result.rooms?.length ? '點選房主房間即可加入' : '目前沒有可加入的房間，可以建立自己的房間');
    } catch (error) {
      console.error('load rooms failed', error);
      roomBrowserList.innerHTML = '<div class="room-browser-empty">房間列表讀取失敗</div>';
      setBrowserMessage('請稍後重新整理', 'error');
    } finally {
      setBusy(false);
    }
  }

  function renderRooms(rooms) {
    roomBrowserList.innerHTML = '';
    if (!rooms.length) {
      roomBrowserList.innerHTML = '<div class="room-browser-empty">目前還沒有房間</div>';
      return;
    }

    rooms.forEach((room) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'room-browser-item';
      button.dataset.roomCode = room.code;

      const host = document.createElement('span');
      host.className = 'room-browser-host';
      host.textContent = `${room.hostName || `房間 ${room.code}`} 的房間`;

      const count = document.createElement('span');
      count.className = 'room-browser-count';
      count.textContent = `${Number(room.count || 0)} / ${Number(room.maxPlayers || 6)}`;

      button.append(host, count);
      button.addEventListener('click', () => joinRoom(room.code));
      roomBrowserList.appendChild(button);
    });
  }

  async function enterRoom(result) {
    if (!result?.ok || !result?.session) {
      setBrowserMessage(result?.message || '無法加入房間', 'error');
      return;
    }

    saveSession(result.session);
    localStorage.setItem('lifeGame.playerName', currentName());
    setBrowserMessage('正在進入房間…');

    socket.emit('room:resume', result.session, (resumeResult) => {
      if (!resumeResult?.ok) {
        clearSession();
        setBrowserMessage(resumeResult?.message || '無法進入房間', 'error');
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
    setBrowserMessage('正在加入房間…');
    try {
      const result = await postRoom('/api/join-room', { code, name });
      await enterRoom(result);
    } catch (error) {
      console.error('join room failed', error);
      setBrowserMessage('加入房間失敗，請再試一次', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function createRoom() {
    if (loading) return;
    const name = currentName();
    if (!name) {
      showEntry();
      setMessage('請先輸入名字', 'error');
      return;
    }

    setBusy(true);
    setBrowserMessage('正在建立你的房間…');
    try {
      const result = await postRoom('/api/create-room', { name });
      await enterRoom(result);
    } catch (error) {
      console.error('create room failed', error);
      setBrowserMessage('建立房間失敗，請再試一次', 'error');
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

  joinGameBtn.addEventListener('click', openRoomBrowser, true);
  playerNameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    openRoomBrowser(event);
  }, true);

  createRoomBtn.addEventListener('click', createRoom);
  refreshRoomsBtn.addEventListener('click', fetchRooms);
  roomBrowserBackBtn.addEventListener('click', () => {
    setBrowserMessage('');
    showEntry();
  });

  roomBrowserPanel.addEventListener('transitionend', () => {
    if (roomBrowserPanel.classList.contains('hidden')) clearTimeout(refreshTimer);
  });

  // 房間列表開啟時每 4 秒更新一次，讓新房間與人數變化自然出現。
  setInterval(() => {
    if (!roomBrowserPanel.classList.contains('hidden') && !loading) fetchRooms();
  }, 4000);
})();
