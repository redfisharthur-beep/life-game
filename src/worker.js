export { GameRoom } from './game-room-recovery.js';
export { Matchmaker } from './matchmaker.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'life-game' });
    }

    if (url.pathname === '/api/auto-join' && request.method === 'POST') {
      const id = env.MATCHMAKER.idFromName('global');
      const matchmaker = env.MATCHMAKER.get(id);
      const target = new URL(request.url);
      target.pathname = '/auto-join';
      return matchmaker.fetch(new Request(target, request));
    }

    const wsMatch = url.pathname.match(/^\/ws\/([A-Za-z0-9_-]{1,32})$/);
    if (wsMatch) {
      const roomCode = wsMatch[1].toUpperCase();
      const id = env.GAME_ROOMS.idFromName(roomCode);
      const room = env.GAME_ROOMS.get(id);
      const target = new URL(request.url);
      target.pathname = '/ws';
      target.searchParams.set('code', roomCode);
      return room.fetch(new Request(target, request));
    }

    const roomMatch = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{1,32})$/);
    if (roomMatch) {
      const roomCode = roomMatch[1].toUpperCase();
      const id = env.GAME_ROOMS.idFromName(roomCode);
      const room = env.GAME_ROOMS.get(id);
      const roomUrl = new URL(request.url);
      roomUrl.pathname = '/health';
      roomUrl.searchParams.set('code', roomCode);
      return room.fetch(new Request(roomUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};
