/**
 * 咻咻的心情隨筆 - 部落格互動與全功能 Markdown 解析邏輯 (app.js)
 * 支援：
 * A. Marked.js (GFM) 完整解析 + Highlight.js 多語言程式碼語法高亮與一鍵複製
 * B. 自動生成文章目錄 (TOC)、上下篇導覽、頂部閱讀進度條、回到頂部按鈕、圖片放大燈箱
 * C. Giscus 讀者留言系統 (自動隨深淺色切換)
 * D. 標題 + 分類 + 摘要 + 完整內文 (searchText) 全文即時搜尋 & 閱讀頁分類標籤點擊篩選
 * E. 置頂文章 (pinned) 徽章、年份歸檔時間軸 (#archive) 與動態分頁標題 (document.title)
 */

(function () {
  const DEFAULT_TITLE = document.title;
  const SITE_NAME = "咻咻的心情隨筆";

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

  // 共用 HTML 跳脫輔助函式 (防止標題如 C++ vector<int> 被當作 HTML 標籤吞字或引發 XSS)
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

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

  // 使用 Highlight.js 進行多語言程式碼高亮並包裝複製按鈕容器
  function buildCodeBlockHtml(rawCode, rawLang) {
    const requestedLang = (rawLang || "").trim().toLowerCase();
    let displayLang = requestedLang || "text";
    let highlightedHtml = escapeHtml(rawCode);

    if (window.hljs) {
      try {
        if (requestedLang && window.hljs.getLanguage(requestedLang)) {
          const res = window.hljs.highlight(rawCode, {
            language: requestedLang,
            ignoreIllegals: true
          });
          highlightedHtml = res.value;
        } else {
          const autoRes = window.hljs.highlightAuto(rawCode);
          highlightedHtml = autoRes.value;
          if (!requestedLang && autoRes.language) {
            displayLang = autoRes.language;
          }
        }
      } catch (e) {}
    }

    const langLabel = escapeHtml(displayLang.toUpperCase());
    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang">${langLabel}</span>
          <button type="button" class="copy-code-btn" aria-label="複製程式碼">📋 複製程式碼</button>
        </div>
        <pre class="code-pre"><code class="hljs language-${escapeHtml(displayLang)}">${highlightedHtml}</code></pre>
      </div>
    `;
  }

  // 解析 Markdown 檔案：剝離 Frontmatter、透過 Marked.js (GFM) 轉為 HTML，並掛載 TOC 錨點、程式碼高亮與圖片燈箱
  function parseMarkdownFile(raw) {
    let body = raw;
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      body = fmMatch[2];
    }

    const headings = [];
    const rawHtml = window.marked.parse(body.trim(), {
      gfm: true,
      breaks: false
    });

    const tpl = document.createElement("template");
    tpl.innerHTML = rawHtml;
    const root = tpl.content;

    // 1. 標題 H1~H3：統一將內文 H1 降階為 H2 (保留頁面唯一 H1 給文章主標題)，並建立 TOC 錨點
    root.querySelectorAll("h1, h2, h3").forEach((headingEl) => {
      const origLevel = Number(headingEl.tagName.slice(1));
      const normalizedLevel = origLevel === 1 ? 2 : origLevel;
      const slug = `heading-${headings.length + 1}`;
      const text = headingEl.textContent.trim();
      headings.push({ id: slug, text, level: normalizedLevel });

      if (origLevel === 1) {
        const h2 = document.createElement("h2");
        h2.innerHTML = headingEl.innerHTML;
        h2.id = slug;
        headingEl.replaceWith(h2);
      } else {
        headingEl.id = slug;
      }
    });

    // 2. 圍欄式程式碼區塊 (pre > code)：套用 Highlight.js 語法高亮與複製按鈕 Header
    root.querySelectorAll("pre > code").forEach((codeEl) => {
      const preEl = codeEl.parentElement;
      if (!preEl || preEl.tagName !== "PRE") return;
      const langMatch = (codeEl.className || "").match(/(?:language|lang)-([a-zA-Z0-9_+-]+)/);
      const rawLang = langMatch ? langMatch[1] : "";
      const rawCode = codeEl.textContent.replace(/\n$/, "");

      const wrapperTpl = document.createElement("template");
      wrapperTpl.innerHTML = buildCodeBlockHtml(rawCode, rawLang).trim();
      preEl.replaceWith(wrapperTpl.content);
    });

    // 3. 圖片 (img)：加上 zoomable-img 與 lazy loading，獨立圖片段落升級為 <figure class="md-figure">
    root.querySelectorAll("img").forEach((imgEl) => {
      imgEl.classList.add("zoomable-img");
      imgEl.setAttribute("loading", "lazy");
      const alt = (imgEl.getAttribute("alt") || "").trim();
      const parent = imgEl.parentElement;
      if (
        parent &&
        parent.tagName === "P" &&
        parent.children.length === 1 &&
        parent.textContent.trim() === ""
      ) {
        const figure = document.createElement("figure");
        figure.className = "md-figure";
        figure.appendChild(imgEl.cloneNode(true));
        if (alt) {
          const caption = document.createElement("figcaption");
          caption.textContent = alt;
          figure.appendChild(caption);
        }
        parent.replaceWith(figure);
      }
    });

    // 4. 表格 (table)：加上 .md-table 並包裹 <div class="table-wrapper">
    root.querySelectorAll("table").forEach((tableEl) => {
      tableEl.classList.add("md-table");
      const wrapper = document.createElement("div");
      wrapper.className = "table-wrapper";
      tableEl.parentNode.insertBefore(wrapper, tableEl);
      wrapper.appendChild(tableEl);
    });

    // 5. 連結 (a)：外部網址加上 target="_blank" rel="noopener noreferrer"，站內連結維持原分頁跳轉
    root.querySelectorAll("a").forEach((aEl) => {
      const href = aEl.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href)) {
        aEl.setAttribute("target", "_blank");
        aEl.setAttribute("rel", "noopener noreferrer");
      }
    });

    // 6. 待辦核取方塊清單與水平分隔線樣式
    root.querySelectorAll('li > input[type="checkbox"]').forEach((checkbox) => {
      const li = checkbox.parentElement;
      if (li) {
        li.classList.add("task-item");
        if (li.parentElement && li.parentElement.tagName === "UL") {
          li.parentElement.classList.add("task-list");
        }
      }
    });
    root.querySelectorAll("hr").forEach((hrEl) => {
      hrEl.classList.add("md-hr");
    });

    return { html: tpl.innerHTML, headings };
  }

  // 取得單篇文章的分類陣列
  function getPostCategories(post) {
    return Array.isArray(post.categories) && post.categories.length > 0
      ? post.categories
      : ["未分類"];
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
        const safeCat = escapeHtml(cat);
        return `<button type="button" class="category-btn ${isActive ? "active" : ""}" data-category="${safeCat}" role="tab" aria-selected="${isActive}">${safeCat}</button>`;
      })
    ].join("");

    categoryTabs.innerHTML = buttonsHtml;
  }

  // 渲染文章卡片列表 (支援置頂徽章、全文內文搜尋與安全 HTML 跳脫)
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
          .map((cat) => `<span class="post-category">${escapeHtml(cat)}</span>`)
          .join("");
        const safeId = escapeHtml(post.id);
        const safeTitle = escapeHtml(post.title);
        const safeExcerpt = escapeHtml(post.excerpt);
        const safeDate = escapeHtml(post.date);
        return `
        <article class="post-card ${post.pinned ? "post-card-pinned" : ""}" data-post-id="${safeId}" tabindex="0" role="button" aria-label="閱讀文章：${safeTitle}">
          <div>
            <div class="post-meta">
              <div class="post-categories">${pinnedBadge}${badgesHtml}</div>
              <time datetime="${safeDate}">${safeDate}</time>
            </div>
            <h2 class="post-title">${safeTitle}</h2>
            <p class="post-excerpt">${safeExcerpt}</p>
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
        const safeYear = escapeHtml(year);
        const itemsHtml = byYear[year]
          .map((post) => {
            const monthDay = escapeHtml((post.date || "").slice(5) || post.date);
            const safeDate = escapeHtml(post.date);
            const safeTitle = escapeHtml(post.title);
            const cats = getPostCategories(post)
              .map((c) => `<span class="archive-cat">${escapeHtml(c)}</span>`)
              .join("");
            return `
              <li class="archive-item">
                <time class="archive-date" datetime="${safeDate}">${monthDay}</time>
                <a href="#post/${encodeURIComponent(post.id)}" class="archive-link">${safeTitle}</a>
                <span class="archive-cats">${cats}</span>
              </li>
            `;
          })
          .join("");
        return `
          <div class="archive-year-group">
            <h3 class="archive-year-title">${safeYear} 年 <span class="archive-year-count">(${byYear[year].length})</span></h3>
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
               <strong class="prev-next-title">${escapeHtml(newerPost.title)}</strong>
             </a>`
          : `<div class="prev-next-placeholder"></div>`
      }
      ${
        olderPost
          ? `<a href="#post/${encodeURIComponent(olderPost.id)}" class="prev-next-card next-card">
               <span class="prev-next-label">較舊一篇 →</span>
               <strong class="prev-next-title">${escapeHtml(olderPost.title)}</strong>
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
    document.title = `${post.title} | ${SITE_NAME}`;
    navPostsLink.classList.add("active");
    navArchiveLink.classList.remove("active");

    const readerCatsEl = document.getElementById("reader-categories");
    const pinnedBadge = post.pinned ? `<span class="pinned-badge">📌 置頂</span>` : "";
    readerCatsEl.innerHTML =
      pinnedBadge +
      getPostCategories(post)
        .map((cat) => {
          const safeCat = escapeHtml(cat);
          return `<button type="button" class="post-category post-category-clickable" data-category="${safeCat}" title="篩選「${safeCat}」分類的文章">${safeCat}</button>`;
        })
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
              `<li class="toc-item toc-level-${h.level}"><a href="#${escapeHtml(h.id)}" class="toc-link">${escapeHtml(h.text)}</a></li>`
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
    document.title = `文章年份歸檔 | ${SITE_NAME}`;
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
    document.title = DEFAULT_TITLE;
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

  // 切換分類並重新渲染列表
  function selectCategory(categoryName) {
    currentCategory = categoryName;
    renderCategoryTabs();
    renderPostList();
  }

  // 首頁分類標籤切換
  categoryTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".category-btn");
    if (!btn) return;
    selectCategory(btn.dataset.category);
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

  // 文章閱讀頁點擊事件：頂部分類膠囊篩選、程式碼一鍵複製、圖片放大燈箱
  articleReader.addEventListener("click", async (e) => {
    const catBtn = e.target.closest(".post-category-clickable");
    if (catBtn && catBtn.dataset.category) {
      const targetCat = catBtn.dataset.category;
      selectCategory(targetCat);
      showHomeView(true);
      controlsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(`🏷️ 已篩選「${targetCat}」分類的文章`);
      return;
    }

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
