# Life Game｜《人生》多人派對遊戲

《人生》是以 Node.js、Express、Socket.io 與 Vanilla JavaScript 製作的 2～6 人即時多人派對遊戲。

## 專案結構

- `server.js`：房間、回合、資產、市場、重大事件與結算核心邏輯。
- `runtime-rules.js`：啟動時套用最終遊戲規則設定，並在規則目標不一致時直接停止啟動，避免部署到半套版本。
- `public/index.html`：首頁、等待玩家、職業選擇、遊戲與結算畫面入口。
- `public/*.js`、`public/*.css`：各介面、動畫、音樂與顯示模組。
- `public/images/`：正式使用的圖片素材。
- `public/music/`：首頁、等待／選職業、遊戲背景音樂與骰子音效。
- `tests/smoke.test.js`：JavaScript 語法、核心規則、前端檔案連結與素材路徑檢查。
- `.github/workflows/ci.yml`：每次推送到 `main` 自動執行最終 Smoke Test。

## 執行

```bash
npm install
npm start
```

預設使用 `PORT` 環境變數，未設定時使用 `3000`。

## 檢查

```bash
npm test
```

測試會確認 JavaScript 語法、主要遊戲設定、首頁引用的 CSS／JS／圖片、程式碼引用的圖片與音樂素材，以及是否殘留已淘汰的根目錄素材。
