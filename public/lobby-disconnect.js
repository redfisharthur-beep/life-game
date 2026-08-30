(() => {
  if (typeof socket === 'undefined') return;

  socket.on('disconnect', () => {
    if (typeof currentRoom === 'undefined' || currentRoom?.phase !== 'lobby') return;

    socket.abandonRoom?.();
    if (typeof clearSession === 'function') clearSession();
    currentRoom = null;

    if (typeof showPanel === 'function' && typeof entryPanel !== 'undefined') {
      showPanel(entryPanel);
    }
    if (typeof setMessage === 'function') {
      setMessage('連線已中斷，請重新輸入名字加入遊戲');
    }
  });
})();
