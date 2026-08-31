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

  const root = document.createElement('div');
  root.className = 'voice-chat-control hidden';
  root.innerHTML = `
    <button class="voice-chat-button" type="button" aria-label="開啟語音聊天" title="語音聊天">🎤</button>
    <span class="voice-chat-label">語音</span>
  `;
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    .voice-chat-control{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:12000;display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 5px 18px rgba(0,0,0,.18);backdrop-filter:blur(8px)}
    .voice-chat-control.hidden{display:none}.voice-chat-button{width:46px;height:46px;border:0;border-radius:50%;font-size:23px;line-height:1;background:#eef2ef;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.07);touch-action:manipulation}.voice-chat-control.on .voice-chat-button{background:#06c755;color:#fff}.voice-chat-control.muted .voice-chat-button{background:#ef5350;color:#fff}.voice-chat-label{font:700 13px/1.2 system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#4b554f;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis}.voice-remote-audio{display:none}
    @media (max-width:640px){.voice-chat-control{right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));padding:5px 7px}.voice-chat-button{width:42px;height:42px;font-size:21px}.voice-chat-label{font-size:12px}}
  `;
  document.head.appendChild(style);

  const button = root.querySelector('.voice-chat-button');
  const label = root.querySelector('.voice-chat-label');

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
      button.textContent = '🎤';
      button.setAttribute('aria-label', '開啟語音聊天');
      label.textContent = '語音';
    } else if (muted) {
      button.textContent = '🔇';
      button.setAttribute('aria-label', '取消靜音');
      label.textContent = '已靜音';
    } else {
      button.textContent = '🎙️';
      button.setAttribute('aria-label', '麥克風靜音');
      label.textContent = peers.size ? `語音 ${peers.size + 1} 人` : '語音開啟';
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
      label.textContent = '麥克風未允許';
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
    if (enabled) label.textContent = '語音重連中';
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

  updateButton();
})();
