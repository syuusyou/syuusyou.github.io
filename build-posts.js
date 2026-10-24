/**
 * 自動掃描 posts/ 資料夾底下的所有 .md 檔案，生成：
 * 1. posts/index.json (支援多重分類 categories、置頂 pinned 與全文搜尋 searchText)
 * 2. sitemap.xml (供 Google Search Console 搜尋引擎收錄)
 * 3. rss.xml (供 RSS 閱讀器訂閱)
 * 執行方式：node build-posts.js
 */
const fs = require("fs");
const path = require("path");

const SITE_URL = "https://syuusyou.github.io";
const SITE_TITLE = "咻咻的心情隨筆";
const SITE_DESC = "記錄生活、靈感與學習點滴的個人部落格。";

const postsDir = path.join(__dirname, "posts");
const outputFile = path.join(postsDir, "index.json");
const sitemapFile = path.join(__dirname, "sitemap.xml");
const rssFile = path.join(__dirname, "rss.xml");

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
  const cleaned = rawCat.replace(/^\[|\]$/g, "");
  const list = cleaned
    .split(/[,，、/]/)
    .map((c) => c.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  return list.length > 0 ? list : ["未分類"];
}

function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1 ")
    .replace(/[#>*`|~_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSitemap(posts) {
  const today = new Date().toISOString().split("T")[0];
  const urls = [
    `  <url>\n    <loc>${SITE_URL}/</loc>\n    <lastmod>${today}</lastmod>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${SITE_URL}/about.html</loc>\n    <lastmod>${today}</lastmod>\n    <priority>0.8</priority>\n  </url>`,
    ...posts.map(
      (p) =>
        `  <url>\n    <loc>${SITE_URL}/#post/${encodeURIComponent(p.id)}</loc>\n    <lastmod>${p.date}</lastmod>\n    <priority>0.9</priority>\n  </url>`
    )
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  fs.writeFileSync(sitemapFile, xml, "utf8");
}

function buildRss(posts) {
  const nowUtc = new Date().toUTCString();
  const items = posts
    .map((p) => {
      const link = `${SITE_URL}/#post/${encodeURIComponent(p.id)}`;
      const pubDate = new Date(`${p.date}T08:00:00+08:00`).toUTCString();
      const cats = p.categories.map((c) => `      <category>${escapeXml(c)}</category>`).join("\n");
      return [
        "    <item>",
        `      <title>${escapeXml(p.title)}</title>`,
        `      <link>${link}</link>`,
        `      <guid>${link}</guid>`,
        `      <pubDate>${pubDate}</pubDate>`,
        cats,
        `      <description>${escapeXml(p.excerpt)}</description>`,
        "    </item>"
      ].join("\n");
    })
    .join("\n");

  const rss = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(SITE_TITLE)}</title>`,
    `    <link>${SITE_URL}/</link>`,
    `    <description>${escapeXml(SITE_DESC)}</description>`,
    "    <language>zh-Hant</language>",
    `    <lastBuildDate>${nowUtc}</lastBuildDate>`,
    `    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
    ""
  ].join("\n");

  fs.writeFileSync(rssFile, rss, "utf8");
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
    const pinned = String(meta.pinned || "").toLowerCase() === "true";
    const plainBody = stripMarkdown(body);

    return {
      id,
      file: `posts/${filename}`,
      title: meta.title || id,
      date: meta.date || "2026-10-25",
      categories,
      pinned,
      excerpt: meta.excerpt || plainBody.slice(0, 90) + (plainBody.length > 90 ? "..." : ""),
      searchText: plainBody
    };
  });

  // 排序：置頂文章 (pinned: true) 優先，接著依日期由新到舊排序
  posts.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return b.date.localeCompare(a.date);
  });

  fs.writeFileSync(outputFile, JSON.stringify(posts, null, 2), "utf8");
  buildSitemap(posts);
  buildRss(posts);
  console.log(`✅ 已掃描 ${posts.length} 篇 Markdown 文章並更新 posts/index.json、sitemap.xml、rss.xml`);
  return posts;
}

if (require.main === module) {
  buildPostsIndex();
}

module.exports = { buildPostsIndex };
