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

function parseCategories(rawCat) {
  if (!rawCat) return ["未分類"];
  // 支援 [分類A, 分類B] 或以逗號 (, / ，)、頓號 (、)、斜線 (/) 分隔的多重分類
  const cleaned = rawCat.replace(/^\[|\]$/g, "");
  const list = cleaned
    .split(/[,，、/]/)
    .map((c) => c.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  return list.length > 0 ? list : ["未分類"];
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
    const categories = parseCategories(meta.categories || meta.category);

    return {
      id,
      file: `posts/${filename}`,
      title: meta.title || id,
      date: meta.date || "2026-10-24",
      categories,
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
