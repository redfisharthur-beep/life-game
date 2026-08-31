export { GameRoom } from './game-room-hardening.js';
export { Matchmaker } from './matchmaker.js';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function randomToken(bytes = 24) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64UrlEncode(data);
}

function base64UrlEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecodeToString(value) {
  const normalized = String(value).replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function getCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  return parts.join('; ');
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

async function createSession(user, secret) {
  const payload = base64UrlEncode(JSON.stringify({
    sub: user.sub,
    name: user.name || 'LINE 玩家',
    picture: user.picture || '',
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  }));
  return `${payload}.${await hmac(secret, payload)}`;
}

async function readSession(request, secret) {
  const raw = getCookie(request, 'life_line_session');
  if (!raw || !secret) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = await hmac(secret, payload);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (mismatch !== 0) return null;
  try {
    const data = JSON.parse(base64UrlDecodeToString(payload));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000) || !data.sub) return null;
    return data;
  } catch {
    return null;
  }
}

function lineConfig(env, requestUrl) {
  const origin = new URL(requestUrl).origin;
  return {
    channelId: env.LINE_CHANNEL_ID || '',
    channelSecret: env.LINE_CHANNEL_SECRET || '',
    sessionSecret: env.AUTH_SESSION_SECRET || '',
    callbackUrl: env.LINE_CALLBACK_URL || `${origin}/auth/line/callback`,
  };
}

function lineConfigReady(config) {
  return Boolean(config.channelId && config.channelSecret && config.sessionSecret && config.callbackUrl);
}

async function handleLineLogin(request, env) {
  const config = lineConfig(env, request.url);
  if (!lineConfigReady(config)) {
    return json({
      ok: false,
      error: 'LINE_LOGIN_NOT_CONFIGURED',
      required: ['LINE_CHANNEL_ID', 'LINE_CHANNEL_SECRET', 'AUTH_SESSION_SECRET'],
      callbackUrl: config.callbackUrl,
    }, 503);
  }

  const state = randomToken(24);
  const nonce = randomToken(24);
  const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', config.channelId);
  authorize.searchParams.set('redirect_uri', config.callbackUrl);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('scope', 'profile openid');
  authorize.searchParams.set('nonce', nonce);

  const headers = new Headers({ location: authorize.toString() });
  headers.append('set-cookie', cookie('life_line_state', state, { maxAge: 600 }));
  headers.append('set-cookie', cookie('life_line_nonce', nonce, { maxAge: 600 }));
  return new Response(null, { status: 302, headers });
}

async function handleLineCallback(request, env) {
  const url = new URL(request.url);
  const config = lineConfig(env, request.url);
  const stateCookie = getCookie(request, 'life_line_state');
  const nonceCookie = getCookie(request, 'life_line_nonce');
  const clearState = cookie('life_line_state', '', { maxAge: 0 });
  const clearNonce = cookie('life_line_nonce', '', { maxAge: 0 });

  const fail = (reason) => {
    const headers = new Headers({ location: `/?line_error=${encodeURIComponent(reason)}` });
    headers.append('set-cookie', clearState);
    headers.append('set-cookie', clearNonce);
    return new Response(null, { status: 302, headers });
  };

  if (!lineConfigReady(config)) return fail('not_configured');
  if (url.searchParams.get('error')) return fail(url.searchParams.get('error'));

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || !stateCookie || state !== stateCookie) return fail('invalid_state');

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.callbackUrl,
    client_id: config.channelId,
    client_secret: config.channelSecret,
  });

  const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenBody,
  });
  if (!tokenResponse.ok) return fail('token_exchange_failed');
  const tokenData = await tokenResponse.json();
  if (!tokenData.id_token) return fail('missing_id_token');

  const verifyResponse = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: tokenData.id_token, client_id: config.channelId }),
  });
  if (!verifyResponse.ok) return fail('id_token_invalid');
  const profile = await verifyResponse.json();
  if (!profile.sub || (nonceCookie && profile.nonce !== nonceCookie)) return fail('nonce_invalid');

  const session = await createSession(profile, config.sessionSecret);
  const headers = new Headers({ location: '/?line_login=success' });
  headers.append('set-cookie', cookie('life_line_session', session, { maxAge: 7 * 24 * 60 * 60 }));
  headers.append('set-cookie', clearState);
  headers.append('set-cookie', clearNonce);
  return new Response(null, { status: 302, headers });
}

async function handleAuthMe(request, env) {
  const config = lineConfig(env, request.url);
  const session = await readSession(request, config.sessionSecret);
  if (!session) return json({ authenticated: false }, 200, { 'cache-control': 'no-store' });
  return json({
    authenticated: true,
    user: { id: session.sub, name: session.name, picture: session.picture || '' },
  }, 200, { 'cache-control': 'no-store' });
}

function handleLogout() {
  return json({ ok: true }, 200, {
    'set-cookie': cookie('life_line_session', '', { maxAge: 0 }),
    'cache-control': 'no-store',
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'life-game' });
    }

    if (url.pathname === '/auth/line' && request.method === 'GET') {
      return handleLineLogin(request, env);
    }

    if (url.pathname === '/auth/line/callback' && request.method === 'GET') {
      return handleLineCallback(request, env);
    }

    if (url.pathname === '/auth/me' && request.method === 'GET') {
      return handleAuthMe(request, env);
    }

    if (url.pathname === '/auth/logout' && request.method === 'POST') {
      return handleLogout();
    }

    if (['/api/auto-join', '/api/rooms', '/api/join-room'].includes(url.pathname)) {
      const id = env.MATCHMAKER.idFromName('global');
      const matchmaker = env.MATCHMAKER.get(id);
      const target = new URL(request.url);
      const paths = {
        '/api/auto-join': '/auto-join',
        '/api/rooms': '/rooms',
        '/api/join-room': '/join-room',
      };
      target.pathname = paths[url.pathname];
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