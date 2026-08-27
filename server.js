const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 12);
}

function normalizeRoomCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function createRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
    })),
    maxPlayers: 6,
  };
}

function emitRoom(room) {
  io.to(room.code).emit('room:update', publicRoom(room));
}

function leaveCurrentRoom(socket) {
  const roomCode = socket.data.roomCode;
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  socket.leave(roomCode);
  delete socket.data.roomCode;

  if (!room) return;

  room.players = room.players.filter((player) => player.id !== socket.id);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players[0].id;
  }

  emitRoom(room);
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.emit('server:ready', {
    message: '《人生》伺服器連線成功',
    socketId: socket.id,
  });

  socket.on('room:create', (payload, reply) => {
    const name = cleanName(payload?.name);

    if (!name) {
      return reply?.({ ok: false, message: '請先輸入玩家名稱。' });
    }

    leaveCurrentRoom(socket);

    const code = createRoomCode();
    const room = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, name }],
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    reply?.({ ok: true, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on('room:join', (payload, reply) => {
    const name = cleanName(payload?.name);
    const code = normalizeRoomCode(payload?.code);

    if (!name) {
      return reply?.({ ok: false, message: '請先輸入玩家名稱。' });
    }

    if (code.length !== 4) {
      return reply?.({ ok: false, message: '請輸入4位數房號。' });
    }

    const room = rooms.get(code);
    if (!room) {
      return reply?.({ ok: false, message: '找不到這個房間，請確認房號。' });
    }

    if (room.players.length >= 6) {
      return reply?.({ ok: false, message: '這個房間已滿（最多6人）。' });
    }

    const duplicateName = room.players.some(
      (player) => player.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicateName) {
      return reply?.({ ok: false, message: '房間內已有相同名稱，請換一個名字。' });
    }

    leaveCurrentRoom(socket);

    room.players.push({ id: socket.id, name });
    socket.join(code);
    socket.data.roomCode = code;

    reply?.({ ok: true, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on('room:leave', (reply) => {
    leaveCurrentRoom(socket);
    reply?.({ ok: true });
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    leaveCurrentRoom(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Life Game server listening on port ${PORT}`);
});
