(() => {
  const NEGATIVE_FATE_INDEXES = new Set([1, 3, 5, 8]);
  const STORAGE_KEY = 'lifeGame.lastHapticEvent';

  function getMyPlayerId() {
    if (typeof myPlayerId !== 'undefined' && myPlayerId) return String(myPlayerId);
    try {
      return localStorage.getItem('lifeGame.playerId') || '';
    } catch (_) {
      return '';
    }
  }

  function hapticKey(room, event) {
    return [
      room?.code || '',
      room?.game?.turnId || '',
      event?.type || '',
      event?.targetId || '',
      event?.fateIndex ?? '',
    ].join(':');
  }

  function alreadyHandled(key) {
    if (!key) return true;
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === key) return true;
      sessionStorage.setItem(STORAGE_KEY, key);
    } catch (_) {}
    return false;
  }

  function vibrate(pattern) {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(0);
      navigator.vibrate(pattern);
    } catch (_) {}
  }

  function handleRoomUpdate(room) {
    const game = room?.game;
    const event = game?.lastEvent;
    if (!game || !event || !game.showcaseUntil) return;

    const me = getMyPlayerId();
    if (!me) return;

    let shouldVibrate = false;
    let pattern = null;

    if (event.type === 'sabotage' && String(event.targetId || '') === me) {
      shouldVibrate = true;
      // 被陷害：兩次短震 + 一次較重長震。
      pattern = [180, 90, 180, 100, 300];
    } else if (
      event.type === 'fate'
      && String(event.playerId || '') === me
      && NEGATIVE_FATE_INDEXES.has(Number(event.fateIndex))
    ) {
      shouldVibrate = true;
      // 負面命運：先警示，再補一次較長震動。
      pattern = [140, 80, 260];
    }

    if (!shouldVibrate) return;

    const key = hapticKey(room, event);
    if (alreadyHandled(key)) return;
    vibrate(pattern);
  }

  if (typeof socket !== 'undefined' && socket?.on) {
    socket.on('room:update', handleRoomUpdate);
  }
})();
