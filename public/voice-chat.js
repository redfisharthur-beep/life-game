(() => {
  if (window.__lifeGameVoiceChatLoaded) return;
  window.__lifeGameVoiceChatLoaded = true;

  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  };

  const peers = new Map();
  const pendingCandidates = new Map();
  let localStream = null;
  let currentRoom = null;
  let enabled = false;
  let muted = false;
  let dragged = false;

  const root = document.createElement('div');
  root.className = 'voice-chat-control hidden';
  root.innerHTML = `
    <button class="voice-chat-button" type="button" aria-label="開啟語音聊天" title="語音聊天">
      <img class="voice-chat-icon" src="/images/mic.png" alt="" decoding="async" draggable="false" />
    </button>
  `;
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    .voice-chat-control{position:fixed;left:50%;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 5vh);transform:translateX(-50%);z-index:12000;display:block;width:100px;height:100px;padding:0;background:transparent;border:0;box-shadow:none;backdrop-filter:none;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}
    .voice-chat-control.dragging{cursor:grabbing}
    .voice-chat-control.hidden{display:none}
    .voice-chat-button{width:100px;height:100px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:0;background:transparent;cursor:inherit;box-shadow:none;touch-action:none;overflow:visible}
    .voice-chat-icon{width:100px;height:100px;display:block;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-drag:none;transition:filter .16s ease,opacity .16s ease,transform .16s ease}
    .voice-chat-control:not(.on) .voice-chat-icon,.voice-chat-control.muted .voice-chat-icon{filter:grayscale(1);opacity:.42}
    .voice-chat-control.on:not(.muted) .voice-chat-icon{filter:none;opacity:1}
    .voice-chat-button:active .voice-chat-icon{transform:scale(.92)}
    .voice-remote-audio{display:none}
    @media (max-width:640px){.voice-chat-control{left:50%;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 3vh);width:60px;height:60px}.voice-chat-button{width:60px;height:60px}.voice-chat-icon{width:60px;height:60px}}
  `;
  document.head.appendChild(style);

  const button = root.querySelector('.voice-chat-button');

  function savePosition() {
    const rect = root.getBoundingClientRect();
    try {
      localStorage.setItem('lifeGame.voicePosition', JSON.stringify({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
      }));
    } catch (_) {}
  }

  function applyPosition(x, y) {
    const width = root.offsetWidth || (window.innerWidth <= 640 ? 60 : 100);
    const height = root.offsetHeight || (window.innerWidth <= 640 ? 60 : 100);
    const maxX = Math.max(0, window.innerWidth - width);
    const maxY = Math.max(0, window.innerHeight - height);
    root.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    root.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.style.transform = 'none';
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem('lifeGame.voicePosition') || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        applyPosition(saved.x, saved.y);
        dragged = true;
      }
    } catch (_) {}
  }

  let dragState = null;
  root.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = root.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    root.classList.add('dragging');
    try { root.setPointerCapture(event.pointerId); } catch (_) {}
  });

  root.addEventListener('pointermove', (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (distance > 5) dragState.moved = true;
    if (!dragState.moved) return;
    event.preventDefault();
    applyPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
  });

  function finishDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const wasMoved = dragState.moved;
    dragState = null;
    root.classList.remove('dragging');
    try { root.releasePointerCapture(event.pointerId); } catch (_) {}
    if (wasMoved) {
      dragged = true;
      savePosition();
      button.dataset.suppressClick = '1';
      setTimeout(() => { delete button.dataset.suppressClick; }, 0);
    }
  }
  root.addEventListener('pointerup', finishDrag);
  root.addEventListener('pointercancel', finishDrag);

  window.addEventListener('resize', () => {
    if (!dragged) return;
    const rect = root.getBoundingClientRect();
    applyPosition(rect.left, rect.top);
    savePosition();
  });

  function myId() {
    return localStorage.getItem('lifeGame.playerId') || '';
  }

  function inPlayableRoom(room) {
    const id = myId();
    return Boolean(id && room?.players?.some((player) => player.id === id)
      && ['lobby', 'profession', 'game', 'finished'].includes(room.phase));
  }

  function updateVisibility(room) {
    currentRoom = room || currentRoom;
    const visible = inPlayableRoom(currentRoom);
    root.classList.toggle('hidden', !visible);
    if (!visible && enabled) stopVoice(false);
  }

  function updateButton() {
    root.classList.toggle('on', enabled && !muted);
    root.classList.toggle('muted', enabled && muted);
    if (!enabled) {
      button.setAttribute('aria-label', '開啟語音聊天');
      button.title = '開啟語音聊天';
    } else if (muted) {
      button.setAttribute('aria-label', '取消靜音');
      button.title = '取消靜音';
    } else {
      button.setAttribute('aria-label', '麥克風靜音');
      button.title = peers.size ? `語音已開啟，共 ${peers.size + 1} 人` : '麥克風靜音';
    }
  }

  function emitVoice(event, payload = {}) {
    return new Promise((resolve) => {
      try {
        socket.emit(event, payload, (result) => resolve(result || { ok: false }));
      } catch (_) {
        resolve({ ok: false });
      }
    });
  }

  function removePeer(peerId) {
    const entry = peers.get(peerId);
    if (!entry) return;
    try { entry.pc.ontrack = null; entry.pc.onicecandidate = null; entry.pc.close(); } catch (_) {}
    try { entry.audio.pause(); entry.audio.srcObject = null; entry.audio.remove(); } catch (_) {}
    peers.delete(peerId);
    pendingCandidates.delete(peerId);
    updateButton();
  }

  function closeAllPeers() {
    [...peers.keys()].forEach(removePeer);
  }

  async function flushCandidates(peerId, pc) {
    const queue = pendingCandidates.get(peerId) || [];
    pendingCandidates.delete(peerId);
    for (const candidate of queue) {
      try { await pc.addIceCandidate(candidate); } catch (_) {}
    }
  }

  function createPeer(peerId) {
    if (!peerId || peerId === myId()) return null;
    const existing = peers.get(peerId);
    if (existing) return existing.pc;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audio = document.createElement('audio');
    audio.className = 'voice-remote-audio';
    audio.autoplay = true;
    audio.playsInline = true;
    document.body.appendChild(audio);

    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      emitVoice('voice:signal', {
        targetPlayerId: peerId,
        signal: { type: 'ice', candidate: event.candidate.toJSON?.() || event.candidate },
      });
    };

    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (stream) audio.srcObject = stream;
      audio.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) removePeer(peerId);
    };

    peers.set(peerId, { pc, audio });
    updateButton();
    return pc;
  }

  async function makeOffer(peerId) {
    if (!enabled || !localStream || !peerId || peerId === myId()) return;
    const pc = createPeer(peerId);
    if (!pc || pc.signalingState !== 'stable') return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await emitVoice('voice:signal', {
        targetPlayerId: peerId,
        signal: { type: 'offer', sdp: pc.localDescription },
      });
    } catch (error) {
      console.warn('voice offer failed', error);
    }
  }

  async function handleSignal(data) {
    if (!enabled || !localStream) return;
    const peerId = String(data?.fromPlayerId || '');
    const signal = data?.signal;
    if (!peerId || peerId === myId() || !signal?.type) return;

    try {
      const pc = createPeer(peerId);
      if (!pc) return;

      if (signal.type === 'offer' && signal.sdp) {
        if (pc.signalingState !== 'stable') {
          try { await pc.setLocalDescription({ type: 'rollback' }); } catch (_) {}
        }
        await pc.setRemoteDescription(signal.sdp);
        await flushCandidates(peerId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await emitVoice('voice:signal', {
          targetPlayerId: peerId,
          signal: { type: 'answer', sdp: pc.localDescription },
        });
      } else if (signal.type === 'answer' && signal.sdp) {
        await pc.setRemoteDescription(signal.sdp);
        await flushCandidates(peerId, pc);
      } else if (signal.type === 'ice' && signal.candidate) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(signal.candidate);
        } else {
          const queue = pendingCandidates.get(peerId) || [];
          queue.push(signal.candidate);
          pendingCandidates.set(peerId, queue.slice(-30));
        }
      }
    } catch (error) {
      console.warn('voice signal failed', error);
    }
  }

  async function startVoice() {
    if (enabled) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      alert('此瀏覽器不支援即時語音聊天，請使用最新版 Chrome、Safari 或 Edge。');
      return;
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      enabled = true;
      muted = false;
      updateButton();
      await emitVoice('voice:announce', { enabled: true });
    } catch (error) {
      console.warn('microphone permission failed', error);
      button.title = '麥克風未允許';
      alert('需要允許麥克風權限才能使用語音聊天。');
    }
  }

  async function stopVoice(announce = true) {
    if (announce && enabled) await emitVoice('voice:announce', { enabled: false });
    enabled = false;
    muted = false;
    closeAllPeers();
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
    }
    localStream = null;
    updateButton();
  }

  function toggleMute() {
    if (!localStream) return;
    muted = !muted;
    localStream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    updateButton();
  }

  button.addEventListener('click', async () => {
    if (button.dataset.suppressClick === '1') return;
    if (!enabled) await startVoice();
    else toggleMute();
  });

  button.addEventListener('contextmenu', (event) => {
    if (!enabled) return;
    event.preventDefault();
    stopVoice(true);
  });

  socket.on('voice:announce', (data) => {
    const peerId = String(data?.playerId || '');
    if (!peerId || peerId === myId()) return;
    if (!data?.enabled) {
      removePeer(peerId);
      return;
    }
    if (enabled && localStream) makeOffer(peerId);
  });

  socket.on('voice:signal', (data) => handleSignal(data));
  socket.on('room:update', (room) => updateVisibility(room));
  socket.on('room:started', (room) => updateVisibility(room));
  socket.on('disconnect', () => {
    closeAllPeers();
    if (enabled) button.title = '語音重連中';
  });
  socket.on('connect', () => {
    if (enabled && localStream) emitVoice('voice:announce', { enabled: true });
  });

  window.addEventListener('pagehide', () => {
    if (enabled) {
      try { socket.emit('voice:announce', { enabled: false }); } catch (_) {}
    }
    if (localStream) localStream.getTracks().forEach((track) => track.stop());
  });

  const observer = new MutationObserver(() => {
    const roomPanel = document.getElementById('roomPanel');
    const professionPanel = document.getElementById('professionPanel');
    const gamePanel = document.getElementById('gamePanel');
    const visible = [roomPanel, professionPanel, gamePanel].some((panel) => panel && !panel.classList.contains('hidden'));
    if (!visible) {
      root.classList.add('hidden');
      if (enabled) stopVoice(true);
    }
  });
  ['roomPanel', 'professionPanel', 'gamePanel'].forEach((id) => {
    const panel = document.getElementById(id);
    if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
  });

  restorePosition();
  updateButton();
})();
