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
    started: Boolean(room.started),
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

function findJoinableRoom(name) {
  for (const room of rooms.values()) {
    if (room.started) continue;
    if (room.players.length >= 6) continue;

    const duplicateName = room.players.some(
      (player) => player.name.toLowerCase() === name.toLowerCase()
    );

    if (!duplicateName) return room;
  }

  return null;
}

function createRoomFor(socket, name) {
  const code = createRoomCode();
  const room = {
    code,
    hostId: socket.id,
    players: [{ id: socket.id, name }],
    started: false,
  };

  rooms.set(code, room);
  socket.join(code);
  socket.data.roomCode = code;
  return room;
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.emit('server:ready', {
    message: '《人生》伺服器連線成功',
    socketId: socket.id,
  });

  socket.on('room:autoJoin', (payload, reply) => {
    const name = cleanName(payload?.name);

    if (!name) {
      return reply?.({ ok: false, message: '請先輸入暱稱。' });
    }

    leaveCurrentRoom(socket);

    let room = findJoinableRoom(name);

    if (room) {
      room.players.push({ id: socket.id, name });
      socket.join(room.code);
      socket.data.roomCode = room.code;
    } else {
      room = createRoomFor(socket, name);
    }

    reply?.({ ok: true, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on('room:start', (reply) => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);

    if (!room) {
      return reply?.({ ok: false, message: '目前不在房間內。' });
    }

    if (room.started) {
      return reply?.({ ok: true, room: publicRoom(room) });
    }

    if (room.players.length < 2) {
      return reply?.({ ok: false, message: '至少需要2位玩家才能啟程。' });
    }

    room.started = true;
    const snapshot = publicRoom(room);
    reply?.({ ok: true, room: snapshot });
    io.to(room.code).emit('room:started', snapshot);
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
