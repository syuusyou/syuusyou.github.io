# 咻咻的心情隨筆 (HsiuHsiu's Blog)

這是「咻咻的心情隨筆」個人部落格原始碼專案，採用 **獨立 Markdown (`.md`) 文章資料夾** 管理每篇隨筆，並搭配 **Marked.js (GFM)** 與 **Highlight.js** 提供完整的 Markdown 與多語言程式碼語法高亮支援。

## 專案資料夾結構
- `posts/`：**所有部落格文章都放在這裡！** 一篇文章就是一個 `.md` 檔案
  - `hello-world.md`
  - `index.json`（由 `build-posts.js` 自動掃描生成的文章目錄與全文檢索索引）
- `build-posts.js`：自動掃描 `posts/*.md` 並更新 `posts/index.json`、`sitemap.xml` 與 `rss.xml` 的建置腳本
- `server.js`：本地開發預覽伺服器（每次重新整理網頁會自動重新掃描 `posts/*.md`）
- `index.html`：網站主畫面結構、SEO / Open Graph 標籤與閱讀器視圖
- `about.html`：獨立的「關於咻咻」個人經歷、學歷與學術著作頁面
- `style.css`：現代響應式排版與原生 `light-dark()` 深淺色主題樣式
- `app.js`：前端路由、Marked.js + Highlight.js 渲染、分類篩選、全文搜尋與 Giscus 留言整合
- `sitemap.xml` / `rss.xml`：自動生成的搜尋引擎網站地圖與 RSS 2.0 訂閱源

## 如何新增一篇 Markdown 文章？
1. 在 `posts/` 資料夾底下新增一個 `.md` 檔案（例如 `posts/my-new-diary.md`），開頭寫上 YAML Frontmatter 文章資訊：
   ```markdown
   ---
   title: 今天的一點小確幸
   date: 2026-10-25
   categories: 心情隨筆, 生活日常
   pinned: false
   excerpt: 這是顯示在首頁文章卡片上的簡短摘要（若省略會自動擷取內文前 90 字）。
   ---

   這裡直接用 **GitHub Flavored Markdown (GFM)** 寫你的文章內容！
   支援表格、待辦清單 (`- [x]`)、引用區塊、圖片放大燈箱，以及 C/C++/Python/Bash 等多語言程式碼高亮。
   ```
2. 本地即時預覽（選用）：
   ```bash
   node server.js
   # 瀏覽器打開 http://localhost:3000 即可即時預覽
   ```
3. 執行索引更新並透過 Git 推送至 `main` 分支上線：
   ```bash
   node build-posts.js
   git add .
   git commit -m "新增文章：今天的一點小確幸"
   git push
   ```
   （註：GitHub Actions `.github/workflows/deploy.yml` 會在推送至 `main` 分支時自動執行 `node build-posts.js` 並部署至 GitHub Pages。）
