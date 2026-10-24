/**
 * 咻咻的心情隨筆 - 部落格互動與 Markdown 解析邏輯 (app.js)
 * 自動從 posts/index.json 載入文章清單，點擊時即時讀取 posts/*.md 並渲染成 HTML
 */

(function () {
  const postsContainer = document.getElementById("posts-container");
  const controlsSection = document.getElementById("posts-section");
  const heroSection = document.getElementById("hero-section");
  const articleReader = document.getElementById("article-reader");
  const categoryTabs = document.getElementById("category-tabs");
  const searchInput = document.getElementById("search-input");
  const backToListBtn = document.getElementById("back-to-list");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const homeLink = document.getElementById("home-link");
  const themeToggleBtn = document.getElementById("theme-toggle");
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

  // 深淺色閱讀模式切換 (遵循標準 <meta name="color-scheme"> 二態切換法)
  themeToggleBtn.addEventListener("click", () => {
    const meta = document.querySelector('meta[name="color-scheme"]');
    const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const systemScheme = systemIsDark ? "dark" : "light";

    let stored = null;
    try {
      stored = localStorage.getItem("color-scheme");
    } catch (e) {}

    const currentlyRendered = stored === "dark" || stored === "light" ? stored : systemScheme;
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

    showToast(targetScheme === "dark" ? "🌙 已切換至深色護眼模式" : "☀️ 已切換至淺色閱讀模式");
  });

  // 輕量安全的語法高亮輔助 (支援 Python / JS / Bash 常見語法)
  function highlightCode(escapedCode, lang) {
    if (!lang) return escapedCode;
    return escapedCode.replace(
      /(#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:def|return|try|except|else|finally|raise|import|from|as|if|elif|not|in|is|None|True|False|for|while|with|class|pass|const|let|var|function|async|await)\b|\b(?:print|open|len|int|float|str|dict|list|ValueError|ZeroDivisionError|TypeError|FileNotFoundError|KeyError|Exception)\b|\b\d+(?:\.\d+)?\b)/gm,
      (match) => {
        if (match.startsWith("#")) {
          return `<span class="tok-comment">${match}</span>`;
        }
        if (match.startsWith('"') || match.startsWith("'")) {
          return `<span class="tok-string">${match}</span>`;
        }
        if (/^\d/.test(match)) {
          return `<span class="tok-number">${match}</span>`;
        }
        if (/^(print|open|len|int|float|str|dict|list|ValueError|ZeroDivisionError|TypeError|FileNotFoundError|KeyError|Exception)$/.test(match)) {
          return `<span class="tok-builtin">${match}</span>`;
        }
        return `<span class="tok-keyword">${match}</span>`;
      }
    );
  }

  // 輕量安全的 Markdown + Frontmatter 解析器 (支援 ``` 程式碼區塊)
  function parseMarkdownFile(raw) {
    let body = raw;
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      body = fmMatch[2];
    }

    const escapeHtml = (str) =>
      str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const formatInline = (text) =>
      escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    const lines = body.trim().split(/\r?\n/);
    let html = "";
    let inList = false;
    let inCodeBlock = false;
    let codeLang = "";
    let codeLines = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      // 處理 ``` 圍欄式程式碼區塊
      if (line.startsWith("```")) {
        if (!inCodeBlock) {
          if (inList) {
            html += "</ul>\n";
            inList = false;
          }
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

      if (!line) {
        if (inList) {
          html += "</ul>\n";
          inList = false;
        }
        continue;
      }

      if (line.startsWith("### ")) {
        if (inList) { html += "</ul>\n"; inList = false; }
        html += `<h3>${formatInline(line.slice(4))}</h3>\n`;
      } else if (line.startsWith("## ")) {
        if (inList) { html += "</ul>\n"; inList = false; }
        html += `<h2>${formatInline(line.slice(3))}</h2>\n`;
      } else if (line.startsWith("# ")) {
        if (inList) { html += "</ul>\n"; inList = false; }
        html += `<h2>${formatInline(line.slice(2))}</h2>\n`;
      } else if (line.startsWith("> ")) {
        if (inList) { html += "</ul>\n"; inList = false; }
        html += `<blockquote>${formatInline(line.slice(2))}</blockquote>\n`;
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        if (!inList) {
          html += "<ul>\n";
          inList = true;
        }
        html += `<li>${formatInline(line.slice(2))}</li>\n`;
      } else {
        if (inList) { html += "</ul>\n"; inList = false; }
        html += `<p>${formatInline(line)}</p>\n`;
      }
    }

    if (inList) {
      html += "</ul>\n";
    }

    return html;
  }

  // 渲染文章卡片列表
  function renderPostList() {
    const filtered = allPosts.filter((post) => {
      const matchCategory = currentCategory === "all" || post.category === currentCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        post.title.toLowerCase().includes(q) ||
        post.excerpt.toLowerCase().includes(q) ||
        post.category.toLowerCase().includes(q);
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
      .map(
        (post) => `
        <article class="post-card" data-post-id="${post.id}" tabindex="0" role="button" aria-label="閱讀文章：${post.title}">
          <div>
            <div class="post-meta">
              <span class="post-category">${post.category}</span>
              <time datetime="${post.date}">${post.date}</time>
            </div>
            <h2 class="post-title">${post.title}</h2>
            <p class="post-excerpt">${post.excerpt}</p>
          </div>
          <div class="post-card-footer">
            <span>${post.readTime}</span>
            <span>閱讀全文 →</span>
          </div>
        </article>
      `
      )
      .join("");
  }

  // 打開單篇文章閱讀器 (動態讀取 posts/<id>.md)
  async function openPost(postId, pushHash = true) {
    const post = allPosts.find((p) => p.id === postId);
    if (!post) {
      closeReader(false);
      return;
    }

    activePostId = post.id;
    document.getElementById("reader-category").textContent = post.category;
    document.getElementById("reader-date").textContent = post.date;
    document.getElementById("reader-readtime").textContent = `· ${post.readTime}`;
    document.getElementById("reader-title").textContent = post.title;
    const contentEl = document.getElementById("reader-content");
    contentEl.innerHTML = "<p>正在載入文章內容...</p>";

    // 隱藏列表、顯示全文閱讀器
    heroSection.classList.add("hidden");
    controlsSection.classList.add("hidden");
    postsContainer.classList.add("hidden");
    articleReader.classList.remove("hidden");

    if (pushHash) {
      history.pushState(null, "", `#post/${post.id}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const res = await fetch(post.file);
      const mdText = await res.text();
      contentEl.innerHTML = parseMarkdownFile(mdText);
    } catch (err) {
      contentEl.innerHTML = "<p>無法讀取 Markdown 文章檔案，請確認伺服器連線正常。</p>";
    }
  }

  // 返回文章列表
  function closeReader(updateHistory = true) {
    activePostId = null;
    articleReader.classList.add("hidden");
    heroSection.classList.remove("hidden");
    controlsSection.classList.remove("hidden");
    postsContainer.classList.remove("hidden");

    if (updateHistory && window.location.hash.startsWith("#post/")) {
      history.pushState(null, "", window.location.pathname);
    }
  }

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

  // 關鍵字即時搜尋
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderPostList();
  });

  // 返回列表按鈕 & 首頁 Logo
  backToListBtn.addEventListener("click", () => closeReader(true));
  homeLink.addEventListener("click", (e) => {
    e.preventDefault();
    closeReader(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  // 程式碼區塊一鍵複製按鈕
  articleReader.addEventListener("click", async (e) => {
    const copyBtn = e.target.closest(".copy-code-btn");
    if (!copyBtn) return;
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
  });

  // 根據網址 Hash 自動打開指定文章
  function handleHashRouting() {
    const hash = window.location.hash;
    if (hash.startsWith("#post/")) {
      const postId = decodeURIComponent(hash.replace("#post/", ""));
      openPost(postId, false);
    } else {
      closeReader(false);
    }
  }

  window.addEventListener("popstate", handleHashRouting);

  // 初始化：讀取 posts/index.json
  async function init() {
    document.getElementById("current-year").textContent = new Date().getFullYear();
    try {
      const res = await fetch("posts/index.json");
      allPosts = await res.json();
      renderPostList();
      handleHashRouting();
    } catch (e) {
      postsContainer.innerHTML = `<div class="empty-state"><p>正在載入文章目錄...</p></div>`;
    }
  }

  init();
})();
