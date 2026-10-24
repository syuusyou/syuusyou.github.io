/**
 * 自動掃描 posts/ 資料夾底下的所有 .md 檔案，生成 posts/index.json 清單
 * 執行方式：node build-posts.js
 */
const fs = require("fs");
const path = require("path");

const postsDir = path.join(__dirname, "posts");
const outputFile = path.join(postsDir, "index.json");

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw };
  }
  const meta = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(":");
    if (idx !== -1) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      meta[key] = val;
    }
  });
  return { meta, body: match[2].trim() };
}

function buildPostsIndex() {
  if (!fs.existsSync(postsDir)) {
    fs.mkdirSync(postsDir, { recursive: true });
  }

  const files = fs
    .readdirSync(postsDir)
    .filter((f) => f.endsWith(".md"));

  const posts = files.map((filename) => {
    const id = filename.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(postsDir, filename), "utf8");
    const { meta, body } = parseFrontmatter(raw);

    // 自動計算閱讀時間 (約每分鐘 300 字)
    const charCount = body.replace(/\s+/g, "").length;
    const estMinutes = Math.max(1, Math.ceil(charCount / 300));

    return {
      id,
      file: `posts/${filename}`,
      title: meta.title || id,
      date: meta.date || "2026-10-24",
      category: meta.category || "心情日常",
      readTime: meta.readTime || `${estMinutes} 分鐘閱讀`,
      excerpt: meta.excerpt || body.slice(0, 80).replace(/[#>*`]/g, "") + "..."
    };
  });

  // 依日期由新到舊排序
  posts.sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(outputFile, JSON.stringify(posts, null, 2), "utf8");
  console.log(`✅ 已掃描 ${posts.length} 篇 Markdown 文章並更新 posts/index.json`);
  return posts;
}

if (require.main === module) {
  buildPostsIndex();
}

module.exports = { buildPostsIndex };
