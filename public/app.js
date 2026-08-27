const socket = io();
const statusEl = document.getElementById('status');

socket.on('connect', () => {
  statusEl.textContent = '已連上伺服器，等待初始化遊戲房間功能。';
  statusEl.classList.add('ok');
});

socket.on('server:ready', (payload) => {
  console.log(payload);
});

socket.on('disconnect', () => {
  statusEl.textContent = '與伺服器連線中斷，正在等待重新連線…';
  statusEl.classList.remove('ok');
});
