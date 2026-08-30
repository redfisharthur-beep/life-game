function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 12);
}

function cleanCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
}

function randomRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export class Matchmaker {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async getRegistry() {
    return (await this.state.storage.get('rooms')) || {};
  }

  async saveRegistry(rooms) {
    await this.state.storage.put('rooms', rooms);
  }

  async joinRoom(code, name) {
    const id = this.env.GAME_ROOMS.idFromName(code);
    const room = this.env.GAME_ROOMS.get(id);
    return room.fetch('https://room.internal/internal/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, name }),
    });
  }

  rememberResult(rooms, code, result) {
    if (!result?.ok || !result?.room) return;
    const host = result.room.players?.find((player) => player.id === result.room.hostId);
    rooms[code] = {
      count: Number(result.room.players?.length || 0),
      started: Boolean(result.room.started),
      hostName: host?.name || rooms[code]?.hostName || '',
      updatedAt: Date.now(),
    };
  }

  publicRooms(rooms) {
    return Object.entries(rooms)
      .filter(([, meta]) => !meta.started && Number(meta.count || 0) > 0 && Number(meta.count || 0) < 6)
      .sort((a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0))
      .map(([code, meta]) => ({
        code,
        hostName: meta.hostName || `房間 ${code}`,
        count: Number(meta.count || 0),
        maxPlayers: 6,
      }));
  }

  async createRoom(name) {
    const rooms = await this.getRegistry();
    let code = randomRoomCode();
    for (let tries = 0; tries < 30 && rooms[code]; tries += 1) code = randomRoomCode();
    if (rooms[code]) return { ok: false, message: '目前無法建立新房間，請稍後再試。' };

    const response = await this.joinRoom(code, name);
    const result = await response.json();
    this.rememberResult(rooms, code, result);
    await this.saveRegistry(rooms);
    return result;
  }

  async joinSpecificRoom(code, name) {
    const rooms = await this.getRegistry();
    const meta = rooms[code];
    if (!meta || meta.started || Number(meta.count || 0) >= 6) {
      return { ok: false, reason: 'unavailable', message: '這個房間已無法加入，請重新整理房間列表。' };
    }

    const response = await this.joinRoom(code, name);
    const result = await response.json();
    if (result.ok) {
      this.rememberResult(rooms, code, result);
    } else if (result.reason === 'full' || result.reason === 'started') {
      delete rooms[code];
    }
    await this.saveRegistry(rooms);
    return result;
  }

  async autoJoin(name) {
    const rooms = await this.getRegistry();
    const candidates = Object.entries(rooms)
      .filter(([, meta]) => !meta.started && Number(meta.count || 0) < 6)
      .sort((a, b) => Number(b[1].count || 0) - Number(a[1].count || 0));

    for (const [code] of candidates) {
      const response = await this.joinRoom(code, name);
      const result = await response.json();
      if (result.ok) {
        this.rememberResult(rooms, code, result);
        await this.saveRegistry(rooms);
        return result;
      }
      if (result.reason === 'full' || result.reason === 'started') delete rooms[code];
      if (result.reason !== 'nameTaken' && result.reason !== 'full' && result.reason !== 'started') {
        await this.saveRegistry(rooms);
        return result;
      }
    }

    return this.createRoom(name);
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/rooms' && request.method === 'GET') {
      const rooms = await this.getRegistry();
      return json({ ok: true, rooms: this.publicRooms(rooms) });
    }

    if (url.pathname === '/create-room' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      const name = cleanName(payload.name);
      if (!name) return json({ ok: false, message: '請輸入暱稱' }, 400);
      return json(await this.createRoom(name));
    }

    if (url.pathname === '/join-room' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      const name = cleanName(payload.name);
      const code = cleanCode(payload.code);
      if (!name || !code) return json({ ok: false, message: '房間或暱稱資料不完整。' }, 400);
      return json(await this.joinSpecificRoom(code, name));
    }

    if (url.pathname === '/auto-join' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      const name = cleanName(payload.name);
      if (!name) return json({ ok: false, message: '請輸入暱稱' }, 400);
      return json(await this.autoJoin(name));
    }

    if (url.pathname === '/sync' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      const code = cleanCode(payload.code);
      if (!code) return json({ ok: false }, 400);
      const rooms = await this.getRegistry();
      if (Number(payload.count || 0) <= 0) {
        delete rooms[code];
      } else {
        rooms[code] = {
          count: Number(payload.count || 0),
          started: Boolean(payload.started),
          hostName: cleanName(payload.hostName) || rooms[code]?.hostName || '',
          updatedAt: Date.now(),
        };
      }
      await this.saveRegistry(rooms);
      return json({ ok: true });
    }

    return json({ ok: false, message: 'Not found' }, 404);
  }
}
