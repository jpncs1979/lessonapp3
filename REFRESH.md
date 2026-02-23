# 変更が画面に反映されないとき

## 1. 開発サーバーを完全に止める
- タスクマネージャーで **Node.js** をすべて終了する
- または PowerShell で: `Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force`

## 2. キャッシュを消してから起動し直す
```powershell
cd c:\Users\tomoh\Desktop\lessonapp3
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev
```

## 3. ブラウザで強制再読み込み
- **Ctrl + Shift + R** または **Ctrl + F5**
- または DevTools (F12) → ネットワーク → 「キャッシュを無効化」にチェック → 再読み込み

## 4. ログインして確認する
- http://localhost:3000 を開く
- **先生**（例: 大和田 智彦）でログイン
- **カレンダー**を開く → タイトルが「**大和田門下 レッスン実施スケジュール**」になっていれば反映済みです
- 同じ画面を下にスクロール → **受講状況サマリー**のブロックがあれば最新版です

まだ「カレンダー」のままのときは、別のタブで開いている古い画面の可能性があります。一度ログアウトしてから再度ログインし、カレンダーを開き直してください。
