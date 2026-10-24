# 咻咻的心情隨筆 (HsiuHsiu's Blog)

這是「咻咻的心情隨筆」個人部落格原始碼專案，採用 **獨立 Markdown (`.md`) 文章資料夾** 管理每篇隨筆。

## 專案資料夾結構
- `posts/`：**所有部落格文章都放在這裡！** 一篇文章就是一個 `.md` 檔案
  - `hello-hsiuhsiu-blog.md`
  - `website-from-zero-notes.md`
  - `autumn-coffee-thoughts.md`
  - `index.json`（由 `build-posts.js` 自動掃描生成的文章目錄）
- `build-posts.js`：自動掃描 `posts/*.md` 並更新目錄的腳本
- `index.html`：網站主畫面結構與 SEO 標籤
- `about.html`：獨立的「關於咻咻」個人經歷頁面
- `style.css`：現代響應式排版與深淺色主題樣式
- `app.js`：前端 Markdown 即時解析、分類篩選與搜尋邏輯

## 如何新增一篇 Markdown 文章？
1. 在 `posts/` 資料夾底下新增一個 `.md` 檔案（例如 `posts/my-new-diary.md`），開頭寫上文章資訊：
   ```markdown
   ---
   title: 今天的一點小確幸
   date: 2026-10-25
   category: 心情日常
   ---

   這裡直接用 **Markdown** 寫你的文章內容！
   ```
2. 執行索引更新並透過 Git 推送上線：
   ```bash
   node build-posts.js
   git add .
   git commit -m "新增文章：今天的一點小確幸"
   git push
   ```
   （註：若在 Cloudflare Pages 設定 Build command 為 `node build-posts.js`，推上 GitHub 就會全自動掃描！）
