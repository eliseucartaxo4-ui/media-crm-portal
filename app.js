(function () {
  "use strict";

  const state = {
    data: window.__CRM_DATA__ || null,
    platform: "all",
    query: "",
    singleClientSlug: null,
    openSlugs: new Set(),
    initializedOpenState: false,
  };

  const numFmt = new Intl.NumberFormat("ru-RU");

  function fmtNum(n) {
    return numFmt.format(Number(n || 0));
  }

  function esc(val) {
    return String(val == null ? "" : val)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatAgo(tsSec) {
    if (!tsSec) return "—";
    const diff = Math.max(0, Math.floor(Date.now() / 1000) - Number(tsSec));
    if (diff < 90) return "только что";
    const mins = Math.floor(diff / 60);
    if (mins < 60) return mins + " мин назад";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + " ч назад";
    const days = Math.floor(hrs / 24);
    if (days === 1) return "вчера";
    if (days < 30) return days + " дн назад";
    const d = new Date(Number(tsSec) * 1000);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  function shortUrlDisplay(url) {
    if (!url) return "—";
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./i, "");
      const path = decodeURIComponent(u.pathname).replace(/\/$/, "");
      if (host === "youtube.com" && path.startsWith("/channel/")) {
        return "youtube.com/" + path.slice(9, 19) + "…";
      }
      return host + path;
    } catch (_) {
      return url;
    }
  }

  function platformIconSvg(plat) {
    if (plat === "youtube") {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/></svg>';
    }
    if (plat === "tiktok") {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.6 6.7a4.8 4.8 0 0 1-3-4.2V2h-3.4v13.7a2.9 2.9 0 1 1-2-2.8V9.4a6.3 6.3 0 1 0 5.4 6.2V9.1a8.1 8.1 0 0 0 4.8 1.6V7.3c-.6 0-1.2-.2-1.8-.6Z"/></svg>';
    }
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>';
  }

  function platformLabel(plat) {
    if (plat === "youtube") return "YouTube";
    if (plat === "tiktok") return "TikTok";
    if (plat === "instagram") return "Instagram";
    return plat;
  }

  function initials(name) {
    const clean = String(name || "").trim();
    if (!clean) return "•";
    const parts = clean.split(/[\s_-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMsg || "Скопировано в буфер");
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast(okMsg || "Скопировано в буфер");
      } catch (__) {}
      ta.remove();
    }
  }

  function detectClientFilterFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = (params.get("client") || params.get("person") || "").trim().toLowerCase();
      return raw || null;
    } catch (_) {
      return null;
    }
  }

  function matchClientBySlug(client, querySlug) {
    if (!querySlug) return true;
    const s = String(client.slug || "").toLowerCase();
    const n = String(client.name || "").toLowerCase();
    if (s === querySlug || n === querySlug) return true;
    if (querySlug === "denis" && s.includes("denis")) return true;
    if (querySlug === "alex" && s.includes("alex")) return true;
    if (querySlug === "ysak" && s.includes("ysak")) return true;
    return false;
  }

  function buildShareUrlForClient(slug) {
    const base = (state.data && state.data.public_url)
      ? state.data.public_url.replace(/\/+$/, "") + "/"
      : window.location.origin + window.location.pathname;
    return base + "?client=" + encodeURIComponent(slug);
  }

  function renderChips(yt, tt, ig, suffix) {
    const out = [];
    if (yt > 0) out.push(`<span class="plat-chip yt">YouTube · ${fmtNum(yt)}${suffix || ""}</span>`);
    if (tt > 0) out.push(`<span class="plat-chip tt">TikTok · ${fmtNum(tt)}${suffix || ""}</span>`);
    if (ig > 0) out.push(`<span class="plat-chip ig">Instagram · ${fmtNum(ig)}${suffix || ""}</span>`);
    return out.join("");
  }

  function syncToggleAllAria() {
    const btn = document.getElementById("toggle-all-btn");
    const acc = document.getElementById("clients-accordion");
    if (!btn || !acc) return;
    const items = acc.querySelectorAll(":scope > details");
    const allOpen = items.length > 0 && Array.prototype.every.call(items, (d) => d.open);
    btn.setAttribute("aria-expanded", String(allOpen));
  }

  function render() {
    const data = state.data;
    if (!data) return;

    const allClients = Array.isArray(data.clients) ? data.clients : [];
    const scopedClients = state.singleClientSlug
      ? allClients.filter((c) => matchClientBySlug(c, state.singleClientSlug))
      : allClients;

    // Header & KPI calculation (scoped to single client if ?client=... is active)
    const updatedPill = document.getElementById("updated-pill");
    if (updatedPill) {
      updatedPill.textContent = "Обновлено " + formatAgo(data.generated_at);
    }

    if (state.singleClientSlug && scopedClients.length === 1) {
      const c = scopedClients[0];
      document.title = c.name + " · CRM Аккаунты и Видео";
      document.getElementById("page-title").textContent = c.name;
      document.getElementById("page-subtitle").textContent = "Персональная сводка аккаунтов, ссылок и выложенных видео";

      document.getElementById("kpi-videos-total").textContent = fmtNum(c.videos_total);
      document.getElementById("kpi-videos-breakdown").innerHTML = renderChips(
        c.by_platform.youtube.videos,
        c.by_platform.tiktok.videos,
        c.by_platform.instagram.videos,
        ""
      );

      document.getElementById("kpi-accounts-total").textContent = fmtNum(c.accounts_count);
      document.getElementById("kpi-accounts-breakdown").innerHTML = renderChips(
        c.by_platform.youtube.accounts,
        c.by_platform.tiktok.accounts,
        c.by_platform.instagram.accounts,
        ""
      );

      document.getElementById("kpi-people-label").textContent = "Суммарные просмотры";
      document.getElementById("kpi-people-total").textContent = fmtNum(c.views_total || 0);
      document.getElementById("kpi-views-note").textContent = "Прямые ссылки на все активные каналы ниже";

      const toggleBtn = document.getElementById("toggle-all-btn");
      if (toggleBtn) toggleBtn.hidden = true;
    } else {
      const t = data.totals || {};
      document.getElementById("kpi-videos-total").textContent = fmtNum(t.videos_total);
      document.getElementById("kpi-videos-breakdown").innerHTML = renderChips(
        t.youtube_videos,
        t.tiktok_videos,
        t.instagram_videos,
        ""
      );

      document.getElementById("kpi-accounts-total").textContent = fmtNum(t.accounts_count);
      document.getElementById("kpi-accounts-breakdown").innerHTML = renderChips(
        t.youtube_accounts,
        t.tiktok_accounts,
        t.instagram_accounts,
        ""
      );

      document.getElementById("kpi-people-label").textContent = "Авторов в CRM";
      document.getElementById("kpi-people-total").textContent = fmtNum(t.people_count);
      document.getElementById("kpi-views-note").textContent =
        t.views_total ? ("Учтено просмотров: " + fmtNum(t.views_total)) : "Все подключённые соцсети и каналы";

      const toggleBtn = document.getElementById("toggle-all-btn");
      if (toggleBtn) toggleBtn.hidden = false;
    }

    // Initialize default open cards once:
    // - single client mode: open it
    // - overview mode: open compact clients (<= 15 accounts), keep 80-account giant collapsible for clean initial overview
    if (!state.initializedOpenState) {
      state.initializedOpenState = true;
      scopedClients.forEach((c) => {
        if (state.singleClientSlug || (c.accounts && c.accounts.length <= 15)) {
          state.openSlugs.add(c.slug);
        }
      });
    }

    const q = state.query.trim().toLowerCase();
    const platFilter = state.platform;

    const container = document.getElementById("clients-accordion");
    const cardsHtml = [];

    scopedClients.forEach((client) => {
      const clientMatchesName = !q || String(client.name || "").toLowerCase().includes(q) || String(client.slug || "").toLowerCase().includes(q);
      const filteredAccs = (client.accounts || []).filter((acc) => {
        if (platFilter !== "all" && acc.platform !== platFilter) return false;
        if (!q || clientMatchesName) return true;
        const hay = (
          String(acc.display_name || "") + " " +
          String(acc.handle || "") + " " +
          String(acc.url || "") + " " +
          String(acc.platform || "")
        ).toLowerCase();
        return hay.includes(q);
      });

      if (filteredAccs.length === 0 && (q || platFilter !== "all")) {
        return;
      }

      const isOpen = Boolean(q) || state.singleClientSlug || state.openSlugs.has(client.slug);
      const ytAcc = client.by_platform?.youtube?.accounts || 0;
      const ttAcc = client.by_platform?.tiktok?.accounts || 0;
      const igAcc = client.by_platform?.instagram?.accounts || 0;

      const metaParts = [];
      metaParts.push(`${fmtNum(client.accounts_count)} акк.`);
      if (ytAcc) metaParts.push(`YT: ${ytAcc}`);
      if (ttAcc) metaParts.push(`TT: ${ttAcc}`);
      if (igAcc) metaParts.push(`IG: ${igAcc}`);

      const rowsHtml = filteredAccs.map((acc) => {
        const subHandle = acc.handle && acc.handle.toLowerCase() !== String(acc.display_name || "").toLowerCase()
          ? `<span class="acc-handle">${esc(acc.handle)}</span>`
          : `<span class="acc-handle">${esc(platformLabel(acc.platform))}</span>`;

        const linkCell = acc.url
          ? `<div class="url-actions">
               <a class="link-btn" href="${esc(acc.url)}" target="_blank" rel="noopener noreferrer" title="${esc(acc.url)}">
                 <span>${esc(shortUrlDisplay(acc.url))}</span>
                 <span aria-hidden="true">↗</span>
               </a>
               <button type="button" class="copy-mini-btn" data-copy-url="${esc(acc.url)}" title="Скопировать ссылку на аккаунт" aria-label="Скопировать ссылку на аккаунт">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
               </button>
             </div>`
          : `<span class="acc-handle">—</span>`;

        const lastPubText = formatAgo(acc.last_published_at);
        const lastCell = acc.last_video_url
          ? `<a class="last-vid-link" href="${esc(acc.last_video_url)}" target="_blank" rel="noopener noreferrer" title="Открыть последнее выложенное видео">${esc(lastPubText)} ↗</a>`
          : `<span class="acc-handle">${esc(lastPubText)}</span>`;

        return `<tr>
          <th scope="row">
            <div class="acc-cell">
              <span class="plat-badge ${esc(acc.platform)}">${platformIconSvg(acc.platform)}</span>
              <div class="acc-names">
                <span class="acc-title" title="${esc(acc.display_name)}">${esc(acc.display_name)}</span>
                ${subHandle}
              </div>
            </div>
          </th>
          <td>${linkCell}</td>
          <td class="num-col"><span class="videos-pill">${fmtNum(acc.videos_count)}</span></td>
          <td class="num-col">${lastCell}</td>
        </tr>`;
      }).join("");

      const archivedNote = (!q && platFilter === "all" && client.archived_videos > 0)
        ? `<div class="archived-footnote">+ ещё ${fmtNum(client.archived_videos)} ранее выложенных видео на архивных/заменённых каналах учтены в общем итоге (${fmtNum(client.videos_total)})</div>`
        : "";

      const shareBtnHtml = state.singleClientSlug
        ? ""
        : `<button type="button" class="share-client-btn" data-share-slug="${esc(client.slug)}" data-share-name="${esc(client.name)}" title="Скопировать персональную ссылку только для ${esc(client.name)}">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
             <span>Ссылка клиента</span>
           </button>`;

      cardsHtml.push(`
        <details class="client-card" data-slug="${esc(client.slug)}" ${isOpen ? "open" : ""}>
          <summary>
            <span class="client-avatar" aria-hidden="true">${esc(initials(client.name))}</span>
            <span class="client-main">
              <span class="client-name">${esc(client.name)}</span>
              <span class="client-meta">${esc(metaParts.join(" · "))}</span>
            </span>
            <span class="client-right">
              ${shareBtnHtml}
              <span class="client-stat">
                <div class="client-stat-num">${fmtNum(client.videos_total)}</div>
                <div class="client-stat-lbl">видео выложено</div>
              </span>
            </span>
          </summary>
          <div class="client-body">
            <div tabindex="0" role="region" aria-label="Аккаунты ${esc(client.name)}" class="table-wrapper">
              <table class="accounts-table">
                <thead>
                  <tr>
                    <th scope="col">Аккаунт</th>
                    <th scope="col">Прямая ссылка</th>
                    <th scope="col" class="num-col">Выложено видео</th>
                    <th scope="col" class="num-col">Крайний ролик</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="4" class="acc-handle">Нет активных аккаунтов по выбранному фильтру</td></tr>'}
                </tbody>
              </table>
            </div>
            ${archivedNote}
          </div>
        </details>
      `);
    });

    container.innerHTML = cardsHtml.length
      ? cardsHtml.join("")
      : '<div class="empty-state">Ничего не найдено по вашему запросу.</div>';

    syncToggleAllAria();
  }

  async function fetchFreshData() {
    const urls = [];
    if (window.location.pathname.startsWith("/crm")) {
      urls.push("/api/crm/data?t=" + Date.now());
    }
    urls.push("./crm_data.json?t=" + Date.now());

    for (const u of urls) {
      try {
        const resp = await fetch(u, { cache: "no-store" });
        if (resp.ok) {
          const json = await resp.json();
          if (json && json.totals) {
            state.data = json;
            render();
            return;
          }
        }
      } catch (_) {}
    }
  }

  function setupThemeToggle() {
    const btn = document.getElementById("theme-toggle-btn");
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (!btn || !meta) return;

    btn.addEventListener("click", () => {
      let stored = null;
      try {
        stored = localStorage.getItem("color-scheme");
      } catch (_) {}

      const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const currentlyDark = stored ? stored === "dark" : sysDark;
      const target = currentlyDark ? "light" : "dark";
      const sysScheme = sysDark ? "dark" : "light";

      if (target === sysScheme) {
        try {
          localStorage.removeItem("color-scheme");
        } catch (_) {}
        meta.content = "light dark";
      } else {
        try {
          localStorage.setItem("color-scheme", target);
        } catch (_) {}
        meta.content = target;
      }
    });

    window.addEventListener("storage", (e) => {
      if (e.key === "color-scheme") {
        meta.content = e.newValue ?? "light dark";
      }
    });
  }

  function setupInteractions() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.query = e.target.value || "";
        render();
      });
    }

    document.querySelectorAll(".plat-pills .pill").forEach((pill) => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".plat-pills .pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        state.platform = pill.dataset.plat || "all";
        render();
      });
    });

    const copyPageBtn = document.getElementById("copy-page-link-btn");
    if (copyPageBtn) {
      copyPageBtn.addEventListener("click", () => {
        let shareUrl = window.location.href;
        if (state.data && state.data.public_url && window.location.hostname === "127.0.0.1") {
          shareUrl = state.singleClientSlug
            ? buildShareUrlForClient(state.singleClientSlug)
            : state.data.public_url;
        }
        copyText(shareUrl, "Публичная ссылка скопирована");
      });
    }

    // Track individual details open/close state + handle copy buttons inside summary/tables
    document.addEventListener("click", (e) => {
      const shareBtn = e.target.closest("[data-share-slug]");
      if (shareBtn) {
        e.preventDefault();
        e.stopPropagation();
        const slug = shareBtn.getAttribute("data-share-slug");
        const name = shareBtn.getAttribute("data-share-name") || slug;
        copyText(buildShareUrlForClient(slug), `Ссылка для «${name}» скопирована`);
        return;
      }

      const copyUrlBtn = e.target.closest("[data-copy-url]");
      if (copyUrlBtn) {
        e.preventDefault();
        e.stopPropagation();
        copyText(copyUrlBtn.getAttribute("data-copy-url"), "Ссылка на аккаунт скопирована");
      }
    });

    document.addEventListener("toggle", (e) => {
      const det = e.target;
      if (!(det instanceof HTMLDetailsElement) || !det.matches("#clients-accordion > details")) return;
      const slug = det.dataset.slug;
      if (slug && !state.query) {
        if (det.open) state.openSlugs.add(slug);
        else state.openSlugs.delete(slug);
      }
      syncToggleAllAria();
    }, { capture: true });

    // Invoker command handler + fallback for browsers without commandForElement
    const toggleAllBtn = document.getElementById("toggle-all-btn");
    const runToggleAll = () => {
      const acc = document.getElementById("clients-accordion");
      if (!acc || !toggleAllBtn) return;
      const expand = toggleAllBtn.getAttribute("aria-expanded") !== "true";
      for (const d of acc.querySelectorAll(":scope > details")) {
        d.open = expand;
        if (d.dataset.slug) {
          if (expand) state.openSlugs.add(d.dataset.slug);
          else state.openSlugs.delete(d.dataset.slug);
        }
      }
      syncToggleAllAria();
    };

    if (Object.hasOwn(HTMLButtonElement.prototype, "commandForElement")) {
      document.addEventListener("command", (event) => {
        if (event.command !== "--toggle-all") return;
        runToggleAll();
      }, { capture: true });
    } else if (toggleAllBtn) {
      toggleAllBtn.addEventListener("click", runToggleAll);
    }
  }

  state.singleClientSlug = detectClientFilterFromUrl();
  setupThemeToggle();
  setupInteractions();

  if (state.data) {
    render();
  }
  fetchFreshData();
  setInterval(fetchFreshData, 60000);
})();
