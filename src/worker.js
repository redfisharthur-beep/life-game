export { GameRoom } from './game-room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'life-game' }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
