# LINE Login 設定

`life-game` 已支援 LINE Login v2.1（Web app）。

## LINE Developers Console

1. 建立或選擇 Provider。
2. 建立 **LINE Login** Channel，App type 選 **Web app**。
3. 在 LINE Login 設定中加入 Callback URL：

   `https://你的遊戲正式網域/auth/line/callback`

4. Channel 狀態需允許實際使用者登入。

## Cloudflare Worker Secrets

在部署 `life-game` 的 Cloudflare Worker 設定以下 Secrets：

- `LINE_CHANNEL_ID`：LINE Login Channel ID
- `LINE_CHANNEL_SECRET`：LINE Login Channel Secret
- `AUTH_SESSION_SECRET`：自行產生的高強度隨機字串（建議至少 32 bytes）

選用：

- `LINE_CALLBACK_URL`：若不設定，程式會自動使用目前網域的 `/auth/line/callback`。正式環境若有多網域，建議明確設定。

Wrangler CLI 範例：

```bash
npx wrangler secret put LINE_CHANNEL_ID
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put AUTH_SESSION_SECRET
```

如需固定 Callback：

```bash
npx wrangler secret put LINE_CALLBACK_URL
```

## 已加入的路由

- `GET /auth/line`：開始 LINE 登入
- `GET /auth/line/callback`：接收 LINE OAuth callback
- `GET /auth/me`：讀取目前登入玩家
- `POST /auth/logout`：登出

登入成功後，首頁會自動顯示 LINE 頭像與名稱，並把 LINE 顯示名稱帶入既有玩家名稱欄位。

## 安全設計

- OAuth `state` 驗證
- OpenID Connect `nonce` 驗證
- LINE v2.1 ID token Verify API 驗證
- 簽章 session cookie
- `HttpOnly` / `Secure` / `SameSite=Lax`
- Channel Secret 僅存在 Worker server-side Secret
