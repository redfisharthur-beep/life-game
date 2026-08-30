(() => {
  const entryPanel = document.getElementById('entryPanel');
  const roomBrowserPanel = document.getElementById('roomBrowserPanel');
  const roomBrowserList = document.getElementById('roomBrowserList');
  const roomBrowserMessage = document.getElementById('roomBrowserMessage');
  const roomBrowserActions = roomBrowserPanel?.querySelector('.room-browser-actions');
  const roomBrowserBackBtn = document.getElementById('roomBrowserBackBtn');
  const joinGameBtn = document.getElementById('joinGameBtn');
  const playerNameInput = document.getElementById('playerName');
  const homeStage = document.getElementById('homeStage');
  const lobbyCard = document.getElementById('lobbyCard');

  if (!entryPanel || !roomBrowserPanel || !roomBrowserList || !roomBrowserBackBtn || !joinGameBtn || !playerNameInput) return;

  // 房間列表下方沿用等待玩家頁的兩個圖示：左下上一頁、右下遊戲規則。
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
    lobbyCard?.classList.remove('home-mode');
    roomBrowserPanel.classList.remove('hidden');
  }

  function hideBrowser() {
    roomBrowserPanel.classList.add('hidden');
  }

  function showEntry() {
    hideBrowser();
    entryPanel.classList.remove('hidden');
    homeStage?.classList.add('home-visible');
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

  async function fetchRooms() {
    if (loading) return;
    setBusy(true);
    setBrowserMessage('');
    try {
      const response = await fetch('/api/rooms', { cache: 'no-store' });
      const result = await response.json();
      if (!result?.ok) throw new Error(result?.message || '讀取房間失敗');
      renderRooms(result.rooms || []);
    } catch (error) {
      console.error('load rooms failed', error);
      roomBrowserList.innerHTML = '<div class="room-browser-empty">房間列表讀取失敗</div>';
    } finally {
      setBusy(false);
    }
  }

  function renderRooms(rooms) {
    roomBrowserList.innerHTML = '';

    rooms.forEach((room) => {
      const available = room.available !== false;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'room-browser-item';
      button.dataset.roomCode = room.code;
      button.dataset.available = String(available);
      button.disabled = !available;
      if (!available) button.classList.add('unavailable');

      const identity = document.createElement('span');
      identity.className = 'room-browser-identity';

      const title = document.createElement('strong');
      title.className = 'room-browser-name';
      title.textContent = `${room.icon || '✨'} ${room.name || room.code}`;

      const host = document.createElement('span');
      host.className = 'room-browser-host';
      if (room.started) {
        host.textContent = '遊戲進行中';
      } else if (room.full) {
        host.textContent = '房間已滿';
      } else if (room.hostName) {
        host.textContent = `房主：${room.hostName}`;
      } else {
        host.textContent = '等待第一位房主';
      }

      identity.append(title, host);

      const count = document.createElement('span');
      count.className = 'room-browser-count';
      count.textContent = `${Number(room.count || 0)} / ${Number(room.maxPlayers || 6)}`;

      button.append(identity, count);
      if (available) button.addEventListener('click', () => joinRoom(room.code));
      roomBrowserList.appendChild(button);
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

  joinGameBtn.addEventListener('click', openRoomBrowser, true);
  playerNameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    openRoomBrowser(event);
  }, true);

  roomBrowserBackBtn.addEventListener('click', () => {
    setBrowserMessage('');
    showEntry();
  });

  roomBrowserRulesBtn?.addEventListener('click', () => {
    document.getElementById('rulesOpenBtn')?.click();
  });

  // 固定四間房每 4 秒在背景同步人數與遊戲狀態，不需要手動重新整理。
  setInterval(() => {
    if (!roomBrowserPanel.classList.contains('hidden') && !loading) fetchRooms();
  }, 4000);
})();
