export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      const code = url.searchParams.get('code') || 'UNKNOWN';
      return new Response(JSON.stringify({
        ok: true,
        durableObject: 'GameRoom',
        room: code,
      }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    return new Response('GameRoom is ready', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}
