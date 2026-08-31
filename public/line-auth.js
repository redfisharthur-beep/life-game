(() => {
  const playerName = document.getElementById('playerName');
  const homeStage = document.getElementById('homeStage');
  if (!playerName || !homeStage) return;

  const style = document.createElement('style');
  style.textContent = `
    .home-stage{position:relative}
    .line-auth-wrap{position:absolute;right:25%;bottom:calc(35.5% + 1px);width:46px;height:46px;z-index:10001;pointer-events:auto}
    .line-icon-btn{width:46px;height:46px;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid rgba(0,0,0,.08);border-radius:11px;background:#06c755;box-shadow:0 3px 9px rgba(0,0,0,.14);cursor:pointer;text-decoration:none;touch-action:manipulation;box-sizing:border-box;overflow:hidden}
    .line-icon-btn:hover{filter:brightness(.97)}
    .line-icon-btn:active{transform:translateY(1px)}
    .line-icon-btn svg{width:30px;height:30px;display:block}
    .line-icon-btn.is-logged-in{box-shadow:0 0 0 2px rgba(6,199,85,.22),0 3px 9px rgba(0,0,0,.14)}
    .line-icon-btn.is-loading{opacity:.62;pointer-events:none}
    .line-auth-error{position:absolute;left:0;top:52px;width:max-content;max-width:min(260px,80vw);padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.96);box-shadow:0 3px 10px rgba(0,0,0,.12);font-size:12px;color:#b83838;text-align:left;z-index:10002}
    @media(max-width:640px){.line-auth-wrap{right:25%;bottom:calc(35.5% + 1px);width:42px;height:42px}.line-icon-btn{width:42px;height:42px}.line-icon-btn svg{width:27px;height:27px}}
  `;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'line-auth-wrap';
  homeStage.appendChild(wrap);

  const lineIconSvg = `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path fill="#fff" d="M32 9C18.7 9 8 17.7 8 28.4c0 9.6 8.5 17.6 20 19.1.8.2 1.9.6 2.2 1.4.3.7.2 1.8.1 2.5l-.4 2.4c-.1.7-.6 2.8 2.4 1.5 3-1.3 16.3-9.6 22.2-16.5C58.6 34.3 56 28.4 56 28.4 56 17.7 45.3 9 32 9Z"/>
      <path fill="#06c755" d="M19.2 23.8h3.4v10.9h5.7v3.1h-9.1v-14Zm11.1 0h3.4v14h-3.4v-14Zm6.2 0h3.2l5.9 8.1v-8.1H49v14h-3l-6.1-8.4v8.4h-3.4v-14Z"/>
    </svg>`;

  function setError(text = '') {
    wrap.querySelector('.line-auth-error')?.remove();
    if (!text) return;
    const error = document.createElement('div');
    error.className = 'line-auth-error';
    error.textContent = text;
    wrap.appendChild(error);
  }

  function makeIcon({ loggedIn = false, loading = false } = {}) {
    wrap.innerHTML = '';
    const control = document.createElement(loggedIn ? 'button' : 'a');
    control.className = `line-icon-btn${loggedIn ? ' is-logged-in' : ''}${loading ? ' is-loading' : ''}`;
    control.innerHTML = lineIconSvg;

    if (loggedIn) {
      control.type = 'button';
      control.title = '已使用 LINE 登入';
      control.setAttribute('aria-label', '已使用 LINE 登入');
    } else {
      control.href = '/auth/line';
      control.title = '使用 LINE 登入';
      control.setAttribute('aria-label', '使用 LINE 登入');
    }

    wrap.appendChild(control);
    return control;
  }

  function showLoggedOut(errorText = '') {
    makeIcon();
    setError(errorText);
  }

  function showLoggedIn(user) {
    makeIcon({ loggedIn: true });

    if (user.name) {
      playerName.value = String(user.name).slice(0, Number(playerName.maxLength) || 12);
      playerName.readOnly = true;
      playerName.title = '名稱來自 LINE 帳號';
    }

    window.lifeGameLineUser = user;
    window.dispatchEvent(new CustomEvent('life-game:line-user', { detail: user }));
  }

  async function loadSession() {
    makeIcon({ loading: true });
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
