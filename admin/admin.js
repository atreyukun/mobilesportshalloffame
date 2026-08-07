(() => {
  const cfg = window.MSHOF_ADMIN;
  if (!cfg) {
    document.body.innerHTML = "<p style='padding:2rem'>Missing admin/config.js</p>";
    return;
  }

  const AUTH_KEY = "mshof_admin_ok";
  const TOKEN_KEY = "mshof_gh_token";

  const loginGate = document.getElementById("login-gate");
  const app = document.getElementById("app");
  const loginForm = document.getElementById("login-form");
  const loginStatus = document.getElementById("login-status");
  const appStatus = document.getElementById("app-status");
  const panels = document.getElementById("tab-panels");
  const tabs = document.getElementById("tabs");
  const previewBox = document.getElementById("json-preview");
  const previewBody = document.getElementById("json-preview-body");
  const tokenModal = document.getElementById("token-modal");
  const tokenForm = document.getElementById("token-form");
  const tokenInput = document.getElementById("token-input");

  /** @type {{ news: any[], event: object, partners: any[], sponsors: any[], board: object }} */
  let state = {
    news: [],
    event: {},
    partners: [],
    sponsors: [],
    board: { title: "", lede: "", officers: [], members: [] },
  };

  let activeTab = "news";
  let editingNewsId = null;
  let editingBrand = { kind: null, id: null };
  /** @type {null | ((token: string) => void | Promise<void>)} */
  let pendingTokenAction = null;

  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || "";
    el.classList.remove("is-error", "is-ok");
    if (kind) el.classList.add(kind);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slugify(str) {
    return String(str)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || `item-${Date.now()}`;
  }

  async function loadAll() {
    const entries = Object.entries(cfg.DATA_FILES);
    const results = await Promise.all(
      entries.map(async ([key, path]) => {
        const res = await fetch(`../${path}`);
        if (!res.ok) throw new Error(`Could not load ${path}`);
        return [key, await res.json()];
      })
    );
    results.forEach(([key, data]) => {
      state[key] = data;
    });
  }

  function showApp() {
    loginGate.hidden = true;
    app.hidden = false;
  }

  function showLogin() {
    sessionStorage.removeItem(AUTH_KEY);
    app.hidden = true;
    loginGate.hidden = false;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = loginForm.password.value;
    setStatus(loginStatus, "Checking…");
    try {
      const hash = await sha256Hex(pw);
      if (hash !== cfg.PASSWORD_SHA256) {
        setStatus(loginStatus, "Incorrect password.", "is-error");
        return;
      }
      sessionStorage.setItem(AUTH_KEY, "1");
      setStatus(loginStatus, "");
      await bootApp();
    } catch (err) {
      setStatus(loginStatus, "Login failed.", "is-error");
    }
  });

  document.getElementById("btn-logout").addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
  });

  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    activeTab = btn.dataset.tab;
    editingNewsId = null;
    editingBrand = { kind: null, id: null };
    tabs.querySelectorAll(".admin-tab").forEach((t) => {
      t.classList.toggle("is-active", t.dataset.tab === activeTab);
    });
    previewBox.hidden = true;
    render();
  });

  document.getElementById("btn-preview").addEventListener("click", () => {
    const data = state[activeTab];
    previewBody.textContent = JSON.stringify(data, null, 2);
    previewBox.hidden = !previewBox.hidden;
  });

  document.getElementById("btn-save").addEventListener("click", () => {
    beginSave();
  });

  document.getElementById("token-cancel").addEventListener("click", () => {
    pendingTokenAction = null;
    tokenModal.hidden = true;
  });

  tokenForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const token = tokenInput.value.trim();
    if (!token) return;
    sessionStorage.setItem(TOKEN_KEY, token);
    tokenModal.hidden = true;
    tokenInput.value = "";
    const action = pendingTokenAction || ((t) => saveCurrentTab(t));
    pendingTokenAction = null;
    Promise.resolve(action(token)).catch((err) => {
      setStatus(appStatus, err.message || "Request failed.", "is-error");
    });
  });

  function withGithubToken(action) {
    const existing = sessionStorage.getItem(TOKEN_KEY);
    if (existing) {
      Promise.resolve(action(existing)).catch((err) => {
        if (/401|403|Bad credentials|Resource not accessible/i.test(String(err.message))) {
          sessionStorage.removeItem(TOKEN_KEY);
        }
        setStatus(appStatus, err.message || "Request failed.", "is-error");
      });
      return;
    }
    pendingTokenAction = action;
    tokenModal.hidden = false;
    tokenInput.focus();
  }

  function beginSave() {
    withGithubToken((token) => saveCurrentTab(token));
  }

  async function saveCurrentTab(token) {
    const key = activeTab;
    const path = cfg.DATA_FILES[key];
    if (!path) return;
    setStatus(appStatus, `Saving ${path}…`);
    try {
      const content = JSON.stringify(state[key], null, 2) + "\n";
      await putGithubFile(path, content, `Update ${path} via admin`, token);
      setStatus(
        appStatus,
        `Saved ${path}. Public site updates after GitHub Pages rebuilds (~1 min).`,
        "is-ok"
      );
    } catch (err) {
      if (/401|403|Bad credentials|Resource not accessible/i.test(String(err.message))) {
        sessionStorage.removeItem(TOKEN_KEY);
      }
      setStatus(appStatus, err.message || "Save failed.", "is-error");
    }
  }

  async function putGithubFile(path, content, message, token, { isBase64 = false } = {}) {
    const { GITHUB_OWNER: owner, GITHUB_REPO: repo, GITHUB_BRANCH: branch } = cfg;
    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };

    let sha;
    const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
      headers,
    });
    if (getRes.ok) {
      const meta = await getRes.json();
      sha = meta.sha;
    } else if (getRes.status !== 404) {
      const err = await getRes.json().catch(() => ({}));
      throw new Error(err.message || `Could not read ${path} (${getRes.status})`);
    }

    const body = {
      message,
      content: isBase64
        ? content
        : btoa(unescape(encodeURIComponent(content))),
      branch,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiBase, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `GitHub save failed (${putRes.status})`);
    }
    return putRes.json();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsDataURL(file);
    });
  }

  function safeAssetName(filename) {
    const parts = String(filename).split(".");
    const ext =
      parts.length > 1
        ? parts.pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "png"
        : "png";
    const base = slugify(parts.join(".")) || `image-${Date.now()}`;
    return `${base}.${ext}`;
  }

  function pathFieldHtml({ id, name, value, label, folder, placeholder }) {
    return `<div class="admin-field">
      <label for="${id}">${escapeHtml(label)}</label>
      <div class="admin-path-row">
        <input id="${id}" name="${name}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder || "")}" />
        <button type="button" class="admin-btn admin-btn--ghost" data-browse-upload data-target="${id}" data-folder="${escapeHtml(folder)}">Browse…</button>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden data-browse-file data-target="${id}" data-folder="${escapeHtml(folder)}" />
      </div>
      <p class="admin-field-hint">Browse uploads the image to GitHub now and fills this path. Then Apply / Save for the JSON.</p>
    </div>`;
  }

  function wireBrowseUploads() {
    panels.querySelectorAll("[data-browse-upload]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        const fileInput = panels.querySelector(
          `[data-browse-file][data-target="${CSS.escape(target)}"]`
        );
        fileInput?.click();
      });
    });
    panels.querySelectorAll("[data-browse-file]").forEach((fileInput) => {
      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        const targetId = fileInput.dataset.target;
        const folder = fileInput.dataset.folder || "assets";
        fileInput.value = "";
        if (!file || !targetId) return;
        uploadImageToRepo(file, folder, targetId);
      });
    });
  }

  function uploadImageToRepo(file, folder, inputId) {
    if (!/^image\//.test(file.type) && !/\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)) {
      setStatus(appStatus, "Please choose an image file (PNG, JPG, WebP, GIF, or SVG).", "is-error");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus(appStatus, "Image must be under 5 MB.", "is-error");
      return;
    }

    withGithubToken(async (token) => {
      const name = safeAssetName(file.name);
      const path = `${String(folder).replace(/\/$/, "")}/${name}`;
      setStatus(appStatus, `Uploading ${path}…`);
      try {
        const base64 = await fileToBase64(file);
        await putGithubFile(path, base64, `Upload ${path} via admin`, token, {
          isBase64: true,
        });
        const input = document.getElementById(inputId);
        if (input) input.value = `${path}?v=${Date.now()}`;
        setStatus(
          appStatus,
          `Uploaded ${path}. Click Apply (if shown), then Save to GitHub for the JSON.`,
          "is-ok"
        );
      } catch (err) {
        if (/401|403|Bad credentials|Resource not accessible/i.test(String(err.message))) {
          sessionStorage.removeItem(TOKEN_KEY);
        }
        setStatus(appStatus, err.message || "Upload failed.", "is-error");
      }
    });
  }

  function render() {
    if (activeTab === "news") renderNews();
    else if (activeTab === "event") renderEvent();
    else if (activeTab === "partners") renderBrands("partners");
    else if (activeTab === "sponsors") renderBrands("sponsors");
    else if (activeTab === "board") renderBoard();
  }

  function scrollToEditor() {
    const editor = panels.querySelector(".admin-editor");
    if (!editor) return;
    requestAnimationFrame(() => {
      editor.scrollIntoView({ behavior: "smooth", block: "start" });
      const focusEl = editor.querySelector("input, textarea, select");
      if (focusEl) focusEl.focus({ preventScroll: true });
    });
  }

  function renderNews() {
    const list = state.news
      .map(
        (n) => `<article class="admin-card">
          <div class="admin-card-top">
            <div>
              <h3>${escapeHtml(n.title)}</h3>
              <p class="admin-card-meta">${n.featured ? "Featured on home · " : ""}${escapeHtml(n.id)}</p>
              <p>${escapeHtml(n.summary || "")}</p>
            </div>
            <div class="admin-card-actions">
              <button type="button" class="admin-btn admin-btn--ghost" data-edit-news="${escapeHtml(n.id)}">Edit</button>
              <button type="button" class="admin-btn admin-btn--danger" data-del-news="${escapeHtml(n.id)}">Delete</button>
            </div>
          </div>
        </article>`
      )
      .join("");

    const editing =
      editingNewsId != null
        ? state.news.find((n) => n.id === editingNewsId) || blankNews()
        : null;

    panels.innerHTML = `
      <div class="admin-toolbar">
        <h2>News posts</h2>
        <button type="button" class="admin-btn" id="news-add">Add news</button>
      </div>
      <div class="admin-list">${list || "<p class='admin-status'>No news yet.</p>"}</div>
      ${
        editing
          ? `<div class="admin-editor" id="news-editor">
        <h3>${editingNewsId && state.news.some((n) => n.id === editingNewsId) ? "Edit post" : "New post"}</h3>
        <form id="news-form">
          <div class="admin-row-2">
            <div class="admin-field">
              <label for="n-id">ID (slug)</label>
              <input id="n-id" name="id" value="${escapeHtml(editing.id)}" required />
            </div>
            <div class="admin-field">
              <label for="n-title">Title</label>
              <input id="n-title" name="title" value="${escapeHtml(editing.title)}" required />
            </div>
          </div>
          <div class="admin-field">
            <label for="n-summary">Summary (home card)</label>
            <textarea id="n-summary" name="summary" required>${escapeHtml(editing.summary || "")}</textarea>
          </div>
          <div class="admin-field">
            <label for="n-body">Body (news archive)</label>
            <textarea id="n-body" name="body">${escapeHtml(editing.body || "")}</textarea>
          </div>
          <div class="admin-row-2">
            <div class="admin-field">
              <label for="n-link">Link URL</label>
              <input id="n-link" name="link" value="${escapeHtml(editing.link || "")}" />
            </div>
            <div class="admin-field">
              <label for="n-linkLabel">Link label</label>
              <input id="n-linkLabel" name="linkLabel" value="${escapeHtml(editing.linkLabel || "")}" />
            </div>
          </div>
          <label class="admin-check"><input type="checkbox" name="featured" ${editing.featured ? "checked" : ""} /> Featured on home page</label>
          <div class="admin-actions">
            <button type="submit" class="admin-btn">Apply to list</button>
            <button type="button" class="admin-btn admin-btn--ghost" id="news-cancel">Cancel</button>
          </div>
        </form>
      </div>`
          : ""
      }`;

    document.getElementById("news-add")?.addEventListener("click", () => {
      editingNewsId = "";
      render();
    });
    document.getElementById("news-cancel")?.addEventListener("click", () => {
      editingNewsId = null;
      render();
    });
    document.getElementById("news-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const item = {
        id: String(fd.get("id") || slugify(fd.get("title"))).trim(),
        title: String(fd.get("title") || "").trim(),
        summary: String(fd.get("summary") || "").trim(),
        body: String(fd.get("body") || "").trim(),
        link: String(fd.get("link") || "").trim(),
        linkLabel: String(fd.get("linkLabel") || "View on original site →").trim(),
        featured: fd.get("featured") === "on",
      };
      const idx = state.news.findIndex((n) => n.id === editingNewsId);
      if (idx >= 0) state.news[idx] = item;
      else {
        const clash = state.news.findIndex((n) => n.id === item.id);
        if (clash >= 0) state.news[clash] = item;
        else state.news.unshift(item);
      }
      editingNewsId = null;
      setStatus(appStatus, "News list updated locally. Click Save to GitHub to publish.", "is-ok");
      render();
    });
    panels.querySelectorAll("[data-edit-news]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingNewsId = btn.getAttribute("data-edit-news");
        render();
      });
    });
    panels.querySelectorAll("[data-del-news]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-del-news");
        if (!confirm("Delete this news post?")) return;
        state.news = state.news.filter((n) => n.id !== id);
        setStatus(appStatus, "Removed locally. Save to GitHub to publish.", "is-ok");
        render();
      });
    });

    if (editing != null) scrollToEditor();
  }

  function blankNews() {
    return {
      id: "",
      title: "",
      summary: "",
      body: "",
      link: "",
      linkLabel: "View on original site →",
      featured: false,
    };
  }

  function renderEvent() {
    const ev = state.event || {};
    panels.innerHTML = `
      <div class="admin-toolbar"><h2>Featured event</h2></div>
      <div class="admin-editor">
        <form id="event-form">
          <div class="admin-row-2">
            <div class="admin-field">
              <label for="e-eyebrow">Eyebrow</label>
              <input id="e-eyebrow" name="eyebrow" value="${escapeHtml(ev.eyebrow || "")}" />
            </div>
            <div class="admin-field">
              <label for="e-dateLabel">Date label</label>
              <input id="e-dateLabel" name="dateLabel" value="${escapeHtml(ev.dateLabel || "")}" />
            </div>
          </div>
          <div class="admin-field">
            <label for="e-title">Title</label>
            <input id="e-title" name="title" value="${escapeHtml(ev.title || "")}" required />
          </div>
          <div class="admin-field">
            <label for="e-lede">Supporting text</label>
            <textarea id="e-lede" name="lede">${escapeHtml(ev.lede || "")}</textarea>
          </div>
          <div class="admin-row-2">
            <div class="admin-field">
              <label for="e-inducteesLabel">Inductees label</label>
              <input id="e-inducteesLabel" name="inducteesLabel" value="${escapeHtml(ev.inducteesLabel || "")}" />
            </div>
            <div class="admin-field">
              <label for="e-inductees">Inductees</label>
              <input id="e-inductees" name="inductees" value="${escapeHtml(ev.inductees || "")}" />
            </div>
          </div>
          <div class="admin-row-2">
            <div class="admin-field">
              <label for="e-ticketUrl">Ticket URL</label>
              <input id="e-ticketUrl" name="ticketUrl" value="${escapeHtml(ev.ticketUrl || "")}" />
            </div>
            <div class="admin-field">
              <label for="e-ticketLabel">Ticket button label</label>
              <input id="e-ticketLabel" name="ticketLabel" value="${escapeHtml(ev.ticketLabel || "")}" />
            </div>
          </div>
          ${pathFieldHtml({
            id: "e-image",
            name: "image",
            value: ev.image || "",
            label: "Image path (repo-relative)",
            folder: "assets",
            placeholder: "assets/hero-banquet-pano.jpg",
          })}
          <div class="admin-actions">
            <button type="submit" class="admin-btn">Apply changes</button>
          </div>
        </form>
      </div>`;

    document.getElementById("event-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.event = {
        eyebrow: String(fd.get("eyebrow") || "").trim(),
        title: String(fd.get("title") || "").trim(),
        lede: String(fd.get("lede") || "").trim(),
        dateLabel: String(fd.get("dateLabel") || "").trim(),
        inducteesLabel: String(fd.get("inducteesLabel") || "").trim(),
        inductees: String(fd.get("inductees") || "").trim(),
        ticketUrl: String(fd.get("ticketUrl") || "").trim(),
        ticketLabel: String(fd.get("ticketLabel") || "").trim(),
        image: String(fd.get("image") || "").trim(),
      };
      setStatus(appStatus, "Event updated locally. Click Save to GitHub to publish.", "is-ok");
    });
    wireBrowseUploads();
  }

  function renderBrands(kind) {
    const items = state[kind] || [];
    const label = kind === "partners" ? "Partners" : "Sponsors";
    const list = items
      .map(
        (b) => `<article class="admin-card">
          <div class="admin-card-top">
            <div>
              <h3>${escapeHtml(b.name)}</h3>
              <p class="admin-card-meta">${escapeHtml(b.domain || "")} · ${escapeHtml(b.logo || "")}</p>
              <p>${escapeHtml(b.url || "")}</p>
            </div>
            <div class="admin-card-actions">
              <button type="button" class="admin-btn admin-btn--ghost" data-edit-brand="${escapeHtml(b.id)}">Edit</button>
              <button type="button" class="admin-btn admin-btn--danger" data-del-brand="${escapeHtml(b.id)}">Delete</button>
            </div>
          </div>
        </article>`
      )
      .join("");

    const editing =
      editingBrand.kind === kind
        ? items.find((b) => b.id === editingBrand.id) || blankBrand()
        : null;

    panels.innerHTML = `
      <div class="admin-toolbar">
        <h2>${label}</h2>
        <button type="button" class="admin-btn" id="brand-add">Add ${kind.slice(0, -1)}</button>
      </div>
      <div class="admin-list">${list || "<p class='admin-status'>None yet.</p>"}</div>
      ${
        editing
          ? `<div class="admin-editor">
        <h3>${editingBrand.id && items.some((b) => b.id === editingBrand.id) ? "Edit" : "New"} ${kind.slice(0, -1)}</h3>
        <form id="brand-form">
          <div class="admin-row-2">
            <div class="admin-field">
              <label for="b-id">ID</label>
              <input id="b-id" name="id" value="${escapeHtml(editing.id)}" required />
            </div>
            <div class="admin-field">
              <label for="b-name">Name</label>
              <input id="b-name" name="name" value="${escapeHtml(editing.name)}" required />
            </div>
          </div>
          <div class="admin-field">
            <label for="b-url">URL</label>
            <input id="b-url" name="url" value="${escapeHtml(editing.url || "")}" />
          </div>
          <div class="admin-row-2">
            ${pathFieldHtml({
              id: "b-logo",
              name: "logo",
              value: editing.logo || "",
              label: "Logo path",
              folder: `assets/${kind}`,
              placeholder: `assets/${kind}/example.png`,
            })}
            <div class="admin-field">
              <label for="b-domain">Domain label</label>
              <input id="b-domain" name="domain" value="${escapeHtml(editing.domain || "")}" />
            </div>
          </div>
          <div class="admin-actions">
            <button type="submit" class="admin-btn">Apply to list</button>
            <button type="button" class="admin-btn admin-btn--ghost" id="brand-cancel">Cancel</button>
          </div>
        </form>
      </div>`
          : ""
      }`;

    document.getElementById("brand-add")?.addEventListener("click", () => {
      editingBrand = { kind, id: "" };
      render();
    });
    document.getElementById("brand-cancel")?.addEventListener("click", () => {
      editingBrand = { kind: null, id: null };
      render();
    });
    document.getElementById("brand-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const item = {
        id: String(fd.get("id") || slugify(fd.get("name"))).trim(),
        name: String(fd.get("name") || "").trim(),
        url: String(fd.get("url") || "").trim(),
        logo: String(fd.get("logo") || "").trim(),
        domain: String(fd.get("domain") || "").trim(),
      };
      const arr = state[kind];
      const idx = arr.findIndex((b) => b.id === editingBrand.id);
      if (idx >= 0) arr[idx] = item;
      else {
        const clash = arr.findIndex((b) => b.id === item.id);
        if (clash >= 0) arr[clash] = item;
        else arr.push(item);
      }
      editingBrand = { kind: null, id: null };
      setStatus(appStatus, `${label} updated locally. Save to GitHub to publish.`, "is-ok");
      render();
    });
    panels.querySelectorAll("[data-edit-brand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingBrand = { kind, id: btn.getAttribute("data-edit-brand") };
        render();
      });
    });
    panels.querySelectorAll("[data-del-brand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-del-brand");
        if (!confirm("Delete this entry?")) return;
        state[kind] = state[kind].filter((b) => b.id !== id);
        setStatus(appStatus, "Removed locally. Save to GitHub to publish.", "is-ok");
        render();
      });
    });

    if (editing != null) {
      wireBrowseUploads();
      scrollToEditor();
    }
  }

  function blankBrand() {
    return { id: "", name: "", url: "", logo: "", domain: "" };
  }

  function renderBoard() {
    const b = state.board || {};
    const officersText = (b.officers || [])
      .map((o) => `${o.name}|${o.title || ""}`)
      .join("\n");
    const membersText = (b.members || []).join("\n");

    panels.innerHTML = `
      <div class="admin-toolbar"><h2>Board members</h2></div>
      <div class="admin-editor">
        <form id="board-form">
          <div class="admin-field">
            <label for="bd-title">Section title</label>
            <input id="bd-title" name="title" value="${escapeHtml(b.title || "")}" />
          </div>
          <div class="admin-field">
            <label for="bd-lede">Lede</label>
            <textarea id="bd-lede" name="lede">${escapeHtml(b.lede || "")}</textarea>
          </div>
          <div class="admin-field">
            <label for="bd-officers">Officers (one per line: Name|Title)</label>
            <textarea id="bd-officers" name="officers" rows="4">${escapeHtml(officersText)}</textarea>
          </div>
          <div class="admin-field">
            <label for="bd-members">Members (one name per line)</label>
            <textarea id="bd-members" name="members" rows="12">${escapeHtml(membersText)}</textarea>
          </div>
          <div class="admin-actions">
            <button type="submit" class="admin-btn">Apply changes</button>
          </div>
        </form>
      </div>`;

    document.getElementById("board-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const officers = String(fd.get("officers") || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, ...rest] = line.split("|");
          return { name: name.trim(), title: rest.join("|").trim() };
        });
      const members = String(fd.get("members") || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      state.board = {
        title: String(fd.get("title") || "").trim(),
        lede: String(fd.get("lede") || "").trim(),
        officers,
        members,
      };
      setStatus(appStatus, "Board updated locally. Click Save to GitHub to publish.", "is-ok");
    });
  }

  async function bootApp() {
    setStatus(appStatus, "Loading…");
    try {
      await loadAll();
      showApp();
      setStatus(appStatus, "");
      render();
    } catch (err) {
      showApp();
      setStatus(appStatus, err.message || "Failed to load data.", "is-error");
    }
  }

  if (sessionStorage.getItem(AUTH_KEY) === "1") {
    bootApp();
  }
})();
