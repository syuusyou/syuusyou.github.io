/**
 * 咻咻的心情隨筆 - 部落格互動與全功能 Markdown 解析邏輯 (app.js)
 * 支援：
 * A. Markdown 圖片燈箱、表格、核取方塊、有序/無序清單、分隔線、程式碼高亮與一鍵複製
 * B. 自動生成文章目錄 (TOC)、上下篇導覽、頂部閱讀進度條、回到頂部按鈕
 * C. Giscus 讀者留言系統 (自動隨深淺色切換)
 * D. 標題 + 分類 + 摘要 + 完整內文 (searchText) 全文即時搜尋
 * E. 置頂文章 (pinned) 徽章與年份歸檔時間軸 (#archive)
 */

(function () {
  const postsContainer = document.getElementById("posts-container");
  const controlsSection = document.getElementById("posts-section");
  const heroSection = document.getElementById("hero-section");
  const archiveSection = document.getElementById("archive-section");
  const archiveContainer = document.getElementById("archive-container");
  const archiveTotalCount = document.getElementById("archive-total-count");
  const articleReader = document.getElementById("article-reader");
  const articleToc = document.getElementById("article-toc");
  const tocList = document.getElementById("toc-list");
  const prevNextNav = document.getElementById("post-prev-next");
  const giscusContainer = document.getElementById("giscus-container");
  const categoryTabs = document.getElementById("category-tabs");
  const searchInput = document.getElementById("search-input");
  const backToListBtn = document.getElementById("back-to-list");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const homeLink = document.getElementById("home-link");
  const navPostsLink = document.getElementById("nav-posts");
  const navArchiveLink = document.getElementById("nav-archive");
  const themeToggleBtn = document.getElementById("theme-toggle");
  const readingProgress = document.getElementById("reading-progress");
  const backToTopBtn = document.getElementById("back-to-top");
  const lightboxDialog = document.getElementById("lightbox-dialog");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxCaption = document.getElementById("lightbox-caption");
  const toastEl = document.getElementById("toast");

  let allPosts = [];
  let currentCategory = "all";
  let searchQuery = "";
  let activePostId = null;

  // 顯示 Toast 提示訊息
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2600);
  }

  // 解析當前實際渲染的深淺色模式 ("dark" | "light")
  function getResolvedTheme() {
    const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const systemScheme = systemIsDark ? "dark" : "light";
    let stored = null;
    try {
      stored = localStorage.getItem("color-scheme");
    } catch (e) {}
    return stored === "dark" || stored === "light" ? stored : systemScheme;
  }

  // 同步更新 Giscus 留言區深淺色主題
  function syncGiscusTheme() {
    const iframe = document.querySelector("iframe.giscus-frame");
    if (!iframe) return;
    const theme = getResolvedTheme() === "dark" ? "noborder_dark" : "noborder_light";
    iframe.contentWindow.postMessage(
      { giscus: { setConfig: { theme } } },
      "https://giscus.app"
    );
  }

  // 深淺色閱讀模式切換 (遵循標準 <meta name="color-scheme"> 二態切換法)
  themeToggleBtn.addEventListener("click", () => {
    const meta = document.querySelector('meta[name="color-scheme"]');
    const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const systemScheme = systemIsDark ? "dark" : "light";

    const currentlyRendered = getResolvedTheme();
    const targetScheme = currentlyRendered === "dark" ? "light" : "dark";

    try {
      if (targetScheme === systemScheme) {
        localStorage.removeItem("color-scheme");
        meta.content = "light dark";
      } else {
        localStorage.setItem("color-scheme", targetScheme);
        meta.content = targetScheme;
      }
    } catch (e) {
      meta.content = targetScheme;
    }

    syncGiscusTheme();
    showToast(targetScheme === "dark" ? "🌙 已切換至深色護眼模式" : "☀️ 已切換至淺色閱讀模式");
  });

  // 輕量安全的語法高亮輔助
  function highlightCode(escapedCode, lang) {
    if (!lang) return escapedCode;
    return escapedCode.replace(
      /(#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:def|return|try|except|else|finally|raise|import|from|as|if|elif|not|in|is|None|True|False|for|while|with|class|pass|const|let|var|function|async|await)\b|\b(?:print|open|len|int|float|str|dict|list|ValueError|ZeroDivisionError|TypeError|FileNotFoundError|KeyError|Exception)\b|\b\d+(?:\.\d+)?\b)/gm,
      (match) => {
        if (match.startsWith("#")) return `<span class="tok-comment">${match}</span>`;
        if (match.startsWith('"') || match.startsWith("'")) return `<span class="tok-string">${match}</span>`;
        if (/^\d/.test(match)) return `<span class="tok-number">${match}</span>`;
        if (/^(print|open|len|int|float|str|dict|list|ValueError|ZeroDivisionError|TypeError|FileNotFoundError|KeyError|Exception)$/.test(match)) {
          return `<span class="tok-builtin">${match}</span>`;
        }
        return `<span class="tok-keyword">${match}</span>`;
      }
    );
  }

  // 全功能 Markdown + Frontmatter 解析器 (回傳 { html, headings })
  function parseMarkdownFile(raw) {
    let body = raw;
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      body = fmMatch[2];
    }

    const escapeHtml = (str) =>
      String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const formatInline = (text) =>
      escapeHtml(text)
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="zoomable-img" loading="lazy">')
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/~~(.+?)~~/g, "<del>$1</del>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|#[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    const lines = body.trim().split(/\r?\n/);
    let html = "";
    let listType = null; // "ul" | "ol" | null
    let inCodeBlock = false;
    let codeLang = "";
    let codeLines = [];
    let tableLines = [];
    const headings = [];

    function closeList() {
      if (listType) {
        html += `</${listType}>\n`;
        listType = null;
      }
    }

    function flushTable() {
      if (tableLines.length === 0) return;
      if (tableLines.length >= 2) {
        const parseRow = (rowStr) =>
          rowStr
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((cell) => cell.trim());

        const headers = parseRow(tableLines[0]);
        const isSeparator = /^[\s|:-]+$/.test(tableLines[1]);
        const startRow = isSeparator ? 2 : 1;

        html += `<div class="table-wrapper"><table class="md-table"><thead><tr>`;
        headers.forEach((h) => {
          html += `<th>${formatInline(h)}</th>`;
        });
        html += `</tr></thead><tbody>`;
        for (let r = startRow; r < tableLines.length; r++) {
          const cells = parseRow(tableLines[r]);
          html += `<tr>`;
          cells.forEach((c) => {
            html += `<td>${formatInline(c)}</td>`;
          });
          html += `</tr>`;
        }
        html += `</tbody></table></div>\n`;
      } else {
        tableLines.forEach((tl) => {
          html += `<p>${formatInline(tl)}</p>\n`;
        });
      }
      tableLines = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      // 處理 ``` 圍欄式程式碼區塊
      if (line.startsWith("```")) {
        closeList();
        flushTable();
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = line.slice(3).trim() || "text";
          codeLines = [];
        } else {
          const escaped = escapeHtml(codeLines.join("\n"));
          const highlighted = highlightCode(escaped, codeLang.toLowerCase());
          const langLabel = escapeHtml(codeLang.toUpperCase());
          html += `
            <div class="code-block-wrapper">
              <div class="code-block-header">
                <span class="code-lang">${langLabel}</span>
                <button type="button" class="copy-code-btn" aria-label="複製程式碼">📋 複製程式碼</button>
              </div>
              <pre class="code-pre"><code class="language-${escapeHtml(codeLang)}">${highlighted}</code></pre>
            </div>
          `;
          inCodeBlock = false;
          codeLang = "";
          codeLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(rawLine);
        continue;
      }

      // 處理 Markdown 表格列 (| ... |)
      if (line.startsWith("|") && line.endsWith("|")) {
        closeList();
        tableLines.push(line);
        continue;
      } else {
        flushTable();
      }

      if (!line) {
        closeList();
        continue;
      }

      // 水平分隔線 (--- 或 ***)
      if (/^(?:---|\*\*\*|___)$/.test(line)) {
        closeList();
        html += `<hr class="md-hr">\n`;
        continue;
      }

      // 獨立圖片區塊 ![alt](src)
      const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        closeList();
        const alt = escapeHtml(imgMatch[1]);
        const src = escapeHtml(imgMatch[2]);
        html += `
          <figure class="md-figure">
            <img src="${src}" alt="${alt}" class="zoomable-img" loading="lazy">
            ${alt ? `<figcaption>${alt}</figcaption>` : ""}
          </figure>
        `;
        continue;
      }

      // 標題 H1~H3 (自動產生 TOC 錨點)
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        closeList();
        const level = headingMatch[1].length;
        const rawText = headingMatch[2].trim();
        const slug = `heading-${headings.length + 1}`;
        const tag = level === 1 ? "h2" : `h${level}`;
        headings.push({ id: slug, text: rawText.replace(/[*`~]/g, ""), level: level === 1 ? 2 : level });
        html += `<${tag} id="${slug}">${formatInline(rawText)}</${tag}>\n`;
        continue;
      }

      // 引用區塊
      if (line.startsWith("> ")) {
        closeList();
        html += `<blockquote>${formatInline(line.slice(2))}</blockquote>\n`;
        continue;
      }

      // 待辦核取方塊清單 (- [x] 或 - [ ])
      const taskMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
      if (taskMatch) {
        if (listType !== "ul") {
          closeList();
          html += `<ul class="task-list">\n`;
          listType = "ul";
        }
        const checked = taskMatch[1].toLowerCase() === "x" ? "checked" : "";
        html += `<li class="task-item"><input type="checkbox" disabled ${checked}> <span>${formatInline(taskMatch[2])}</span></li>\n`;
        continue;
      }

      // 無序清單 (- 或 *)
      if (line.startsWith("- ") || line.startsWith("* ")) {
        if (listType !== "ul") {
          closeList();
          html += "<ul>\n";
          listType = "ul";
        }
        html += `<li>${formatInline(line.slice(2))}</li>\n`;
        continue;
      }

      // 有序編號清單 (1. 2. 3.)
      const olMatch = line.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (listType !== "ol") {
          closeList();
          html += "<ol>\n";
          listType = "ol";
        }
        html += `<li>${formatInline(olMatch[1])}</li>\n`;
        continue;
      }

      closeList();
      html += `<p>${formatInline(line)}</p>\n`;
    }

    closeList();
    flushTable();

    return { html, headings };
  }

  // 取得單篇文章的分類陣列
  function getPostCategories(post) {
    if (Array.isArray(post.categories) && post.categories.length > 0) {
      return post.categories;
    }
    if (post.category) {
      return String(post.category)
        .split(/[,，、/]/)
        .map((c) => c.trim())
        .filter(Boolean);
    }
    return ["未分類"];
  }

  // 根據所有文章的 categories 動態生成分類按鈕
  function renderCategoryTabs() {
    const categories = [];
    allPosts.forEach((post) => {
      getPostCategories(post).forEach((cat) => {
        if (cat && !categories.includes(cat)) {
          categories.push(cat);
        }
      });
    });

    const buttonsHtml = [
      `<button type="button" class="category-btn ${currentCategory === "all" ? "active" : ""}" data-category="all" role="tab" aria-selected="${currentCategory === "all"}">全部隨筆</button>`,
      ...categories.map((cat) => {
        const isActive = currentCategory === cat;
        return `<button type="button" class="category-btn ${isActive ? "active" : ""}" data-category="${cat}" role="tab" aria-selected="${isActive}">${cat}</button>`;
      })
    ].join("");

    categoryTabs.innerHTML = buttonsHtml;
  }

  // 渲染文章卡片列表 (支援置頂徽章與全文內文搜尋)
  function renderPostList() {
    const filtered = allPosts.filter((post) => {
      const postCats = getPostCategories(post);
      const matchCategory = currentCategory === "all" || postCats.includes(currentCategory);
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        post.title.toLowerCase().includes(q) ||
        post.excerpt.toLowerCase().includes(q) ||
        (post.searchText && post.searchText.toLowerCase().includes(q)) ||
        postCats.some((c) => c.toLowerCase().includes(q));
      return matchCategory && matchSearch;
    });

    if (filtered.length === 0) {
      postsContainer.innerHTML = `
        <div class="empty-state">
          <p>找不到符合條件的隨筆文章 🌱</p>
        </div>
      `;
      return;
    }

    postsContainer.innerHTML = filtered
      .map((post) => {
        const pinnedBadge = post.pinned ? `<span class="pinned-badge">📌 置頂</span>` : "";
        const badgesHtml = getPostCategories(post)
          .map((cat) => `<span class="post-category">${cat}</span>`)
          .join("");
        return `
        <article class="post-card ${post.pinned ? "post-card-pinned" : ""}" data-post-id="${post.id}" tabindex="0" role="button" aria-label="閱讀文章：${post.title}">
          <div>
            <div class="post-meta">
              <div class="post-categories">${pinnedBadge}${badgesHtml}</div>
              <time datetime="${post.date}">${post.date}</time>
            </div>
            <h2 class="post-title">${post.title}</h2>
            <p class="post-excerpt">${post.excerpt}</p>
          </div>
          <div class="post-card-footer">
            <span>閱讀全文 →</span>
          </div>
        </article>
      `;
      })
      .join("");
  }

  // 渲染年份歸檔視圖 (#archive)
  function renderArchiveView() {
    archiveTotalCount.textContent = `目前共累積 ${allPosts.length} 篇隨筆文章`;
    const byYear = {};

    // 依日期由新到舊分組
    const sortedByDate = [...allPosts].sort((a, b) => b.date.localeCompare(a.date));
    sortedByDate.forEach((post) => {
      const year = (post.date || "2026").slice(0, 4);
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(post);
    });

    const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));
    archiveContainer.innerHTML = years
      .map((year) => {
        const itemsHtml = byYear[year]
          .map((post) => {
            const monthDay = (post.date || "").slice(5) || post.date;
            const cats = getPostCategories(post)
              .map((c) => `<span class="archive-cat">${c}</span>`)
              .join("");
            return `
              <li class="archive-item">
                <time class="archive-date" datetime="${post.date}">${monthDay}</time>
                <a href="#post/${encodeURIComponent(post.id)}" class="archive-link">${post.title}</a>
                <span class="archive-cats">${cats}</span>
              </li>
            `;
          })
          .join("");
        return `
          <div class="archive-year-group">
            <h3 class="archive-year-title">${year} 年 <span class="archive-year-count">(${byYear[year].length})</span></h3>
            <ul class="archive-list">${itemsHtml}</ul>
          </div>
        `;
      })
      .join("");
  }

  // 渲染文章底部「上一篇 / 下一篇」導覽卡片
  function renderPrevNextNav(currentPostId) {
    const idx = allPosts.findIndex((p) => p.id === currentPostId);
    if (idx === -1 || allPosts.length <= 1) {
      prevNextNav.innerHTML = "";
      prevNextNav.classList.add("hidden");
      return;
    }

    const newerPost = idx > 0 ? allPosts[idx - 1] : null;
    const olderPost = idx < allPosts.length - 1 ? allPosts[idx + 1] : null;

    prevNextNav.classList.remove("hidden");
    prevNextNav.innerHTML = `
      ${
        newerPost
          ? `<a href="#post/${encodeURIComponent(newerPost.id)}" class="prev-next-card prev-card">
               <span class="prev-next-label">← 較新一篇</span>
               <strong class="prev-next-title">${newerPost.title}</strong>
             </a>`
          : `<div class="prev-next-placeholder"></div>`
      }
      ${
        olderPost
          ? `<a href="#post/${encodeURIComponent(olderPost.id)}" class="prev-next-card next-card">
               <span class="prev-next-label">較舊一篇 →</span>
               <strong class="prev-next-title">${olderPost.title}</strong>
             </a>`
          : `<div class="prev-next-placeholder"></div>`
      }
    `;
  }

  // 載入 Giscus 讀者留言區
  function loadGiscusComments(postId) {
    giscusContainer.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.setAttribute("data-repo", "syuusyou/syuusyou.github.io");
    script.setAttribute("data-repo-id", "MDEwOlJlcG9zaXRvcnk1MzgyNTU2MQ==");
    script.setAttribute("data-category", "General");
    script.setAttribute("data-category-id", "DIC_kwDOAzVQGc4DJh35");
    script.setAttribute("data-mapping", "specific");
    script.setAttribute("data-term", postId);
    script.setAttribute("data-strict", "0");
    script.setAttribute("data-reactions-enabled", "1");
    script.setAttribute("data-emit-metadata", "0");
    script.setAttribute("data-input-position", "top");
    script.setAttribute(
      "data-theme",
      getResolvedTheme() === "dark" ? "noborder_dark" : "noborder_light"
    );
    script.setAttribute("data-lang", "zh-TW");
    script.crossOrigin = "anonymous";
    script.async = true;
    giscusContainer.appendChild(script);
  }

  // 打開單篇文章閱讀器 (動態讀取 posts/<id>.md)
  async function openPost(postId, pushHash = true) {
    const post = allPosts.find((p) => p.id === postId);
    if (!post) {
      showHomeView(false);
      return;
    }

    activePostId = post.id;
    navPostsLink.classList.add("active");
    navArchiveLink.classList.remove("active");

    const readerCatsEl = document.getElementById("reader-categories");
    const pinnedBadge = post.pinned ? `<span class="pinned-badge">📌 置頂</span>` : "";
    readerCatsEl.innerHTML =
      pinnedBadge +
      getPostCategories(post)
        .map((cat) => `<span class="post-category">${cat}</span>`)
        .join("");

    document.getElementById("reader-date").textContent = post.date;
    document.getElementById("reader-title").textContent = post.title;
    const contentEl = document.getElementById("reader-content");
    contentEl.innerHTML = "<p>正在載入文章內容...</p>";
    articleToc.classList.add("hidden");

    // 切換視圖
    heroSection.classList.add("hidden");
    controlsSection.classList.add("hidden");
    postsContainer.classList.add("hidden");
    archiveSection.classList.add("hidden");
    articleReader.classList.remove("hidden");

    renderPrevNextNav(post.id);
    loadGiscusComments(post.id);

    if (pushHash) {
      history.pushState(null, "", `#post/${post.id}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const res = await fetch(post.file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const mdText = await res.text();
      const { html, headings } = parseMarkdownFile(mdText);
      contentEl.innerHTML = html;

      // 自動生成文章目錄 (TOC)
      if (headings.length >= 2) {
        tocList.innerHTML = headings
          .map(
            (h) =>
              `<li class="toc-item toc-level-${h.level}"><a href="#${h.id}" class="toc-link">${h.text}</a></li>`
          )
          .join("");
        articleToc.classList.remove("hidden");
      } else {
        articleToc.classList.add("hidden");
      }
      updateReadingProgress();
    } catch (err) {
      contentEl.innerHTML = "<p>無法讀取 Markdown 文章檔案，請確認伺服器連線正常。</p>";
    }
  }

  // 顯示年份歸檔視圖
  function showArchiveView(pushHash = true) {
    activePostId = null;
    readingProgress.style.width = "0%";
    navPostsLink.classList.remove("active");
    navArchiveLink.classList.add("active");

    articleReader.classList.add("hidden");
    heroSection.classList.add("hidden");
    controlsSection.classList.add("hidden");
    postsContainer.classList.add("hidden");
    archiveSection.classList.remove("hidden");

    renderArchiveView();
    if (pushHash) {
      history.pushState(null, "", "#archive");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // 返回首頁文章列表
  function showHomeView(updateHistory = true) {
    activePostId = null;
    readingProgress.style.width = "0%";
    navPostsLink.classList.add("active");
    navArchiveLink.classList.remove("active");

    articleReader.classList.add("hidden");
    archiveSection.classList.add("hidden");
    heroSection.classList.remove("hidden");
    controlsSection.classList.remove("hidden");
    postsContainer.classList.remove("hidden");

    if (updateHistory && window.location.hash) {
      history.pushState(null, "", window.location.pathname);
    }
  }

  // TOC 目錄點擊平滑跳轉 (不覆蓋 #post/ 路由)
  tocList.addEventListener("click", (e) => {
    const link = e.target.closest(".toc-link");
    if (!link) return;
    e.preventDefault();
    const targetId = link.getAttribute("href").slice(1);
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // 點擊卡片進入文章
  postsContainer.addEventListener("click", (e) => {
    const card = e.target.closest(".post-card");
    if (card) {
      openPost(card.dataset.postId);
    }
  });

  postsContainer.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".post-card");
      if (card) {
        e.preventDefault();
        openPost(card.dataset.postId);
      }
    }
  });

  // 分類切換
  categoryTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".category-btn");
    if (!btn) return;

    document.querySelectorAll(".category-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");

    currentCategory = btn.dataset.category;
    renderPostList();
  });

  // 關鍵字即時搜尋 (支援標題、分類、摘要與完整文章內文)
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderPostList();
  });

  // 導覽列與返回按鈕事件
  backToListBtn.addEventListener("click", () => showHomeView(true));
  homeLink.addEventListener("click", (e) => {
    e.preventDefault();
    showHomeView(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  navPostsLink.addEventListener("click", (e) => {
    e.preventDefault();
    showHomeView(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  navArchiveLink.addEventListener("click", (e) => {
    e.preventDefault();
    showArchiveView(true);
  });

  // 複製文章分享連結
  copyLinkBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("✅ 已複製文章網址，快貼給朋友分享吧！");
    } catch (e) {
      showToast("🔗 請直接複製瀏覽器上方網址列分享！");
    }
  });

  // 程式碼區塊一鍵複製 & 圖片點擊開啟 <dialog> 放大燈箱
  articleReader.addEventListener("click", async (e) => {
    const copyBtn = e.target.closest(".copy-code-btn");
    if (copyBtn) {
      const wrapper = copyBtn.closest(".code-block-wrapper");
      const codeEl = wrapper ? wrapper.querySelector("code") : null;
      if (!codeEl) return;

      try {
        await navigator.clipboard.writeText(codeEl.innerText);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "✅ 已複製！";
        showToast("📋 程式碼已複製到剪貼簿！");
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 2000);
      } catch (err) {
        showToast("⚠️ 無法自動複製，請手動選取複製");
      }
      return;
    }

    // 點擊圖片開啟放大預覽燈箱
    const imgEl = e.target.closest(".zoomable-img");
    if (imgEl && lightboxDialog) {
      lightboxImg.src = imgEl.src;
      lightboxImg.alt = imgEl.alt || "";
      lightboxCaption.textContent = imgEl.alt || "";
      lightboxDialog.showModal();
    }
  });

  // MANDATORY Fallback: 為尚未支援 <dialog closedby="any"> 的瀏覽器 (如 Safari) 提供點擊背景關閉支援
  if (lightboxDialog && !("closedBy" in HTMLDialogElement.prototype)) {
    lightboxDialog.addEventListener("click", (event) => {
      if (event.target !== lightboxDialog) return;
      const rect = lightboxDialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      lightboxDialog.close();
    });
  }

  // 頂部閱讀進度條 & 右下角回到頂部按鈕控制
  function updateReadingProgress() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 320) {
      backToTopBtn.classList.add("visible");
    } else {
      backToTopBtn.classList.remove("visible");
    }

    if (!activePostId) {
      readingProgress.style.width = "0%";
      return;
    }

    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 100;
    readingProgress.style.width = `${pct}%`;
  }

  window.addEventListener("scroll", updateReadingProgress, { passive: true });
  backToTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // 根據網址 Hash 自動打開指定文章或年份歸檔
  function handleHashRouting() {
    const hash = window.location.hash;
    if (hash.startsWith("#post/")) {
      const postId = decodeURIComponent(hash.replace("#post/", ""));
      openPost(postId, false);
    } else if (hash === "#archive") {
      showArchiveView(false);
    } else {
      showHomeView(false);
    }
  }

  window.addEventListener("popstate", handleHashRouting);
  window.addEventListener("hashchange", handleHashRouting);

  // 初始化：讀取 posts/index.json
  async function init() {
    document.getElementById("current-year").textContent = new Date().getFullYear();
    try {
      const res = await fetch("posts/index.json");
      allPosts = await res.json();
      renderCategoryTabs();
      renderPostList();
      handleHashRouting();
    } catch (e) {
      postsContainer.innerHTML = `<div class="empty-state"><p>正在載入文章目錄...</p></div>`;
    }
  }

  init();
})();
