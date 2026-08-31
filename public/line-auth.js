(() => {
  const playerName = document.getElementById('playerName');
  const entryPanel = document.getElementById('entryPanel');
  if (!playerName || !entryPanel) return;

  const style = document.createElement('style');
  style.textContent = `
    .line-auth-wrap{display:grid;gap:8px;margin-top:10px;position:relative;z-index:9999;pointer-events:auto}.line-login-btn,.line-logout-btn{width:100%;border:0;border-radius:12px;min-height:46px;font:700 16px/1.2 system-ui,-apple-system,"Noto Sans TC",sans-serif;cursor:pointer;pointer-events:auto;position:relative;z-index:10000}.line-login-btn{display:flex;align-items:center;justify-content:center;text-decoration:none;background:#06c755;color:#fff;box-shadow:0 5px 14px rgba(6,199,85,.22);touch-action:manipulation}.line-login-btn:hover{filter:brightness(.97)}.line-user-card{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:14px;background:rgba(255,255,255,.9);border:1px solid rgba(0,0,0,.08);position:relative;z-index:10000}.line-user-avatar{width:42px;height:42px;border-radius:50%;object-fit:cover;background:#eee;flex:0 0 auto}.line-user-copy{min-width:0;flex:1;text-align:left}.line-user-name{font-weight:800;color:#2d342f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.line-user-note{font-size:12px;color:#68716b;margin-top:2px}.line-logout-btn{width:auto;min-height:34px;padding:0 10px;font-size:12px;background:#f0f2f1;color:#59615c}.line-auth-error{font-size:12px;color:#b83838;text-align:center}.line-auth-loading{font-size:13px;color:#68716b;text-align:center}
  `;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'line-auth-wrap';
  entryPanel.appendChild(wrap);

  function escapeText(value) {
    return String(value ?? '');
  }

  function showLoggedOut(errorText = '') {
    wrap.innerHTML = '';
    const link = document.createElement('a');
    link.className = 'line-login-btn';
    link.href = '/auth/line';
    link.textContent = 'LINE 登入';
    link.setAttribute('role', 'button');
    link.setAttribute('aria-label', '使用 LINE 登入');
    wrap.appendChild(link);
    if (errorText) {
      const error = document.createElement('div');
      error.className = 'line-auth-error';
      error.textContent = errorText;
      wrap.appendChild(error);
    }
  }

  function showLoggedIn(user) {
    wrap.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'line-user-card';

    if (user.picture) {
      const avatar = document.createElement('img');
      avatar.className = 'line-user-avatar';
      avatar.src = user.picture;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';
      card.appendChild(avatar);
    }

    const copy = document.createElement('div');
    copy.className = 'line-user-copy';
    const name = document.createElement('div');
    name.className = 'line-user-name';
    name.textContent = escapeText(user.name || 'LINE 玩家');
    const note = document.createElement('div');
    note.className = 'line-user-note';
    note.textContent = '已使用 LINE 登入';
    copy.append(name, note);
    card.appendChild(copy);

    const logout = document.createElement('button');
    logout.className = 'line-logout-btn';
    logout.type = 'button';
    logout.textContent = '登出';
    logout.addEventListener('click', async () => {
      try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
      window.location.replace('/');
    });
    card.appendChild(logout);
    wrap.appendChild(card);

    if (user.name) {
      playerName.value = String(user.name).slice(0, Number(playerName.maxLength) || 12);
      playerName.readOnly = true;
      playerName.title = '名稱來自 LINE 帳號';
    }

    window.lifeGameLineUser = user;
    window.dispatchEvent(new CustomEvent('life-game:line-user', { detail: user }));
  }

  async function loadSession() {
    wrap.innerHTML = '<div class="line-auth-loading">確認 LINE 登入狀態…</div>';
    const params = new URLSearchParams(window.location.search);
    const callbackError = params.get('line_error');
    try {
      const response = await fetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (response.ok && data.authenticated && data.user) {
        showLoggedIn(data.user);
      } else {
        showLoggedOut(callbackError ? 'LINE 登入未完成，請再試一次。' : '');
      }
    } catch (_) {
      showLoggedOut('目前無法確認 LINE 登入狀態。');
    }

    if (params.has('line_login') || params.has('line_error')) {
      params.delete('line_login');
      params.delete('line_error');
      const query = params.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }
  }

  loadSession();
})();
