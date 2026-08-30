export { GameRoom } from './game-room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'life-game' }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
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
