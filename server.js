/**
 * 本地即時預覽伺服器 (server.js)
 * 特色：每次重新整理網頁時，會自動重新載入最新的 build-posts.js 並掃描 posts/*.md
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";

    // 每次請求文章目錄時，清除快取並重新執行最新的 buildPostsIndex()
    if (urlPath === "/posts/index.json") {
      try {
        const buildModulePath = require.resolve("./build-posts");
        delete require.cache[buildModulePath];
        const { buildPostsIndex } = require("./build-posts");
        buildPostsIndex();
      } catch (e) {}
    }

    const filePath = path.join(ROOT_DIR, urlPath);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`🚀 「咻咻的心情隨筆」本地預覽伺服器已啟動：http://localhost:${PORT}`);
  });
