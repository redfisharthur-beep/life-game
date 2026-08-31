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

const FIXED_ROOMS = [
  { code: 'DREAM', name: '夢想起跑線', icon: '✨' },
  { code: 'FORTUNE', name: '財富翻身局', icon: '💰' },
  { code: 'HAPPY', name: '幸福人生館', icon: '💖' },
  { code: 'DESTINY', name: '命運轉折站', icon: '🎲' },
  { code: 'TURNAROUND', name: '人生逆轉局', icon: '🔥' },
  { code: 'SUMMIT', name: '人生巔峰局', icon: '🏆' },
];

const FIXED_ROOM_BY_CODE = Object.fromEntries(FIXED_ROOMS.map((room) => [room.code, room]));

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

  async refreshLiveRooms(rooms) {
    const now = Date.now();
    const results = await Promise.all(FIXED_ROOMS.map(async (fixedRoom) => {
      try {
        const id = this.env.GAME_ROOMS.idFromName(fixedRoom.code);
        const room = this.env.GAME_ROOMS.get(id);
        const response = await room.fetch('https://room.internal/internal/presence', {
          method: 'POST',
        });
        if (!response.ok) return null;
        const status = await response.json();
        if (!status?.ok) return null;
        return { code: fixedRoom.code, status };
      } catch (error) {
        console.error('room presence refresh failed', fixedRoom.code, error);
        return null;
      }
    }));

    for (const result of results) {
      if (!result) continue;
      const { code, status } = result;
      const count = Math.max(0, Number(status.count || 0));
      rooms[code] = {
        count,
        started: count > 0 ? Boolean(status.started) : false,
        hostName: count > 0 ? cleanName(status.hostName) : '',
        updatedAt: now,
      };
    }

    await this.saveRegistry(rooms);
    return rooms;
  }

  rememberResult(rooms, code, result) {
    if (!result?.ok || !result?.room) return;
    const onlinePlayers = (result.room.players || []).filter((player) => player.connected);
    const host = onlinePlayers.find((player) => player.id === result.room.hostId)
      || onlinePlayers[0]
      || result.room.players?.find((player) => player.id === result.room.hostId);
    rooms[code] = {
      count: onlinePlayers.length || Number(result.room.players?.length || 0),
      started: Boolean(result.room.started),
      hostName: host?.name || rooms[code]?.hostName || '',
      updatedAt: Date.now(),
    };
  }

  publicRooms(rooms) {
    return FIXED_ROOMS.map((fixedRoom) => {
      const meta = rooms[fixedRoom.code] || {};
      const count = Number(meta.count || 0);
      const started = Boolean(meta.started);
      const full = count >= 6;
      return {
        code: fixedRoom.code,
        name: fixedRoom.name,
        icon: fixedRoom.icon,
        hostName: meta.hostName || '',
        count,
        maxPlayers: 6,
        started,
        full,
        available: !started && !full,
      };
    });
  }

  async joinSpecificRoom(code, name, { skipRefresh = false } = {}) {
    const fixed = FIXED_ROOM_BY_CODE[code];
    if (!fixed) return { ok: false, reason: 'unavailable', message: '這個房間不存在。' };

    const rooms = await this.getRegistry();
    if (!skipRefresh) await this.refreshLiveRooms(rooms);
    const meta = rooms[code] || {};
    if (meta.started) return { ok: false, reason: 'started', message: '這個房間正在遊戲中，請選其他房間。' };
    if (Number(meta.count || 0) >= 6) return { ok: false, reason: 'full', message: '這個房間已滿，請選其他房間。' };

    const response = await this.joinRoom(code, name);
    const result = await response.json();
    if (result.ok) {
      this.rememberResult(rooms, code, result);
    } else if (result.reason === 'full' || result.reason === 'started') {
      rooms[code] = {
        ...meta,
        started: result.reason === 'started' ? true : Boolean(meta.started),
        count: result.reason === 'full' ? 6 : Number(meta.count || 0),
        updatedAt: Date.now(),
      };
    }
    await this.saveRegistry(rooms);
    return result;
  }

  async autoJoin(name) {
    const rooms = await this.getRegistry();
    await this.refreshLiveRooms(rooms);
    const candidates = FIXED_ROOMS
      .map((room) => ({ room, meta: rooms[room.code] || {} }))
      .filter(({ meta }) => !meta.started && Number(meta.count || 0) < 6)
      .sort((a, b) => Number(b.meta.count || 0) - Number(a.meta.count || 0));

    for (const { room } of candidates) {
      const result = await this.joinSpecificRoom(room.code, name, { skipRefresh: true });
      if (result.ok) return result;
      if (!['nameTaken', 'full', 'started'].includes(result.reason)) return result;
    }

    return { ok: false, message: '目前六個房間都在遊戲中或已滿，請稍後再試。' };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/rooms' && request.method === 'GET') {
      const rooms = await this.getRegistry();
      await this.refreshLiveRooms(rooms);
      return json({ ok: true, rooms: this.publicRooms(rooms) });
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
      if (!code || !FIXED_ROOM_BY_CODE[code]) return json({ ok: false }, 400);
      const rooms = await this.getRegistry();
      if (Number(payload.count || 0) <= 0) {
        rooms[code] = {
          count: 0,
          started: false,
          hostName: '',
          updatedAt: Date.now(),
        };
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
