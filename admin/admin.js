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
  const tokenModal = document.getElementById("token-modal");
  const tokenForm = document.getElementById("token-form");
  const tokenInput = document.getElementById("token-input");
  const deleteModal = document.getElementById("delete-modal");
  const deleteForm = document.getElementById("delete-form");
  const deleteItemName = document.getElementById("delete-item-name");
  const deleteConfirmInput = document.getElementById("delete-confirm-input");
  const deleteConfirmBtn = document.getElementById("delete-confirm-btn");
  const deleteCancel = document.getElementById("delete-cancel");

  /** @type {null | ((ok: boolean) => void)} */
  let deleteResolver = null;

  /** @type {{ news: any[], event: any[], partners: any[], sponsors: any[], board: object }} */
  let state = {
    news: [],
    event: [],
    partners: [],
    sponsors: [],
    board: { title: "", lede: "", officers: [], members: [] },
  };

  let activeTab = "news";
  let editingNewsId = null;
  let editingEventId = null;
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
      if (key === "event" && data && !Array.isArray(data)) {
        state.event = [
          {
            ...data,
            id: data.id || "legacy-event",
            featured: data.featured !== false,
            archived: !!data.archived,
          },
        ];
      } else {
        state[key] = data;
      }
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
    editingEventId = null;
    editingBrand = { kind: null, id: null };
    tabs.querySelectorAll(".admin-tab").forEach((t) => {
      t.classList.toggle("is-active", t.dataset.tab === activeTab);
    });
    render();
  });

  document.getElementById("btn-save").addEventListener("click", () => {
    beginSave();
  });

  document.getElementById("token-cancel").addEventListener("click", () => {
    pendingTokenAction = null;
    tokenModal.hidden = true;
  });

  function closeDeleteModal(ok) {
    deleteModal.hidden = true;
    deleteConfirmInput.value = "";
    deleteConfirmBtn.disabled = true;
    const resolve = deleteResolver;
    deleteResolver = null;
    if (resolve) resolve(ok);
  }

  function confirmDelete(itemLabel) {
    return new Promise((resolve) => {
      deleteResolver = resolve;
      deleteItemName.textContent = itemLabel || "this item";
      deleteConfirmInput.value = "";
      deleteConfirmBtn.disabled = true;
      deleteModal.hidden = false;
      deleteConfirmInput.focus();
    });
  }

  deleteConfirmInput.addEventListener("input", () => {
    deleteConfirmBtn.disabled = deleteConfirmInput.value.trim().toUpperCase() !== "DELETE";
  });

  deleteCancel.addEventListener("click", () => closeDeleteModal(false));

  deleteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (deleteConfirmInput.value.trim().toUpperCase() !== "DELETE") return;
    closeDeleteModal(true);
  });

  deleteModal.addEventListener("click", (e) => {
    if (e.target === deleteModal) closeDeleteModal(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !deleteModal.hidden) {
      e.preventDefault();
      closeDeleteModal(false);
    }
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
        `Saved. The live site usually updates within about a minute.`,
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
      throw new Error(err.message || `Save failed (${putRes.status})`);
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

  function pathFieldHtml({ id, name, value, label, folder, placeholder, hint }) {
    return `<div class="admin-field">
      <label for="${id}">${escapeHtml(label)}</label>
      <div class="admin-path-row">
        <input id="${id}" name="${name}" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder || "")}" />
        <button type="button" class="admin-btn admin-btn--ghost" data-browse-upload data-target="${id}" data-folder="${escapeHtml(folder)}">Browse…</button>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden data-browse-file data-target="${id}" data-folder="${escapeHtml(folder)}" />
      </div>
      <p class="admin-field-hint">${escapeHtml(
        hint || "Click Browse to pick a photo from your computer."
      )}</p>
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
          `Uploaded ${path}. Click Apply (if shown), then Save.`,
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

  function domainFromUrl(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./i, "");
      return host || "";
    } catch {
      return "";
    }
  }

  function renderNews() {
    const list = state.news
      .map(
        (n) => `<article class="admin-card">
          <div class="admin-card-top">
            <div>
              <h3>${escapeHtml(n.title)}</h3>
              <p class="admin-card-meta">${n.featured ? "Shown on the home page" : "News & Events page only"}</p>
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
    const isExisting =
      editing && editingNewsId && state.news.some((n) => n.id === editingNewsId);

    panels.innerHTML = `
      <div class="admin-toolbar">
        <h2>News</h2>
        <button type="button" class="admin-btn" id="news-add">Add news</button>
      </div>
      <div class="admin-list">${list || "<p class='admin-status'>No news yet. Click Add news to create a post.</p>"}</div>
      ${
        editing
          ? `<div class="admin-editor" id="news-editor">
        <h3>${isExisting ? "Edit news post" : "New news post"}</h3>
        <p class="admin-field-hint" style="margin:-6px 0 16px">Fill in what you know. Leave optional fields blank if you don’t need them.</p>
        <form id="news-form">
          <input type="hidden" name="id" value="${escapeHtml(editing.id)}" />
          <div class="admin-field">
            <label for="n-title">Headline</label>
            <input id="n-title" name="title" value="${escapeHtml(editing.title)}" required placeholder="e.g. 2025 Inductees Announced" />
          </div>
          <div class="admin-field">
            <label for="n-summary">Short summary</label>
            <p class="admin-field-hint" style="margin:0 0 8px">Shown on the home page when this post is featured.</p>
            <textarea id="n-summary" name="summary" required placeholder="One or two sentences">${escapeHtml(editing.summary || "")}</textarea>
          </div>
          <div class="admin-field">
            <label for="n-body">Full story <span class="admin-optional">(optional)</span></label>
            <p class="admin-field-hint" style="margin:0 0 8px">Shown on the News &amp; Events page. If blank, the short summary is used.</p>
            <textarea id="n-body" name="body" placeholder="Longer write-up">${escapeHtml(editing.body || "")}</textarea>
          </div>
          <div class="admin-row-2">
            <div class="admin-field">
              <label for="n-link">Read more link <span class="admin-optional">(optional)</span></label>
              <input id="n-link" name="link" value="${escapeHtml(editing.link || "")}" placeholder="https://" />
            </div>
            <div class="admin-field">
              <label for="n-linkLabel">Link button text</label>
              <input id="n-linkLabel" name="linkLabel" value="${escapeHtml(editing.linkLabel || "Read more →")}" placeholder="Read more →" />
            </div>
          </div>
          <label class="admin-check"><input type="checkbox" name="featured" ${editing.featured ? "checked" : ""} /> Also show this on the home page</label>
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
      const title = String(fd.get("title") || "").trim();
      const existingId = String(fd.get("id") || "").trim();
      const item = {
        id: existingId || slugify(title),
        title,
        summary: String(fd.get("summary") || "").trim(),
        body: String(fd.get("body") || "").trim(),
        link: String(fd.get("link") || "").trim(),
        linkLabel: String(fd.get("linkLabel") || "Read more →").trim() || "Read more →",
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
      setStatus(appStatus, "News updated. Click Save to publish.", "is-ok");
      render();
    });
    panels.querySelectorAll("[data-edit-news]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingNewsId = btn.getAttribute("data-edit-news");
        render();
      });
    });
    panels.querySelectorAll("[data-del-news]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del-news");
        const item = state.news.find((n) => n.id === id);
        const ok = await confirmDelete(item?.title || "this news post");
        if (!ok) return;
        if (editingNewsId === id) editingNewsId = null;
        state.news = state.news.filter((n) => n.id !== id);
        setStatus(appStatus, "Removed. Saving…", "is-ok");
        render();
        beginSave();
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
      linkLabel: "Read more →",
      featured: false,
    };
  }

  function blankEvent() {
    return {
      id: "",
      featured: false,
      archived: false,
      eyebrow: "",
      title: "",
      lede: "",
      dateLabel: "",
      inducteesLabel: "",
      inductees: "",
      ticketUrl: "",
      ticketLabel: "Buy Tickets",
      image: "",
    };
  }

  function activeEvents() {
    return state.event.filter((ev) => !ev.archived);
  }

  function archivedEvents() {
    return state.event.filter((ev) => ev.archived);
  }

  function ensureFeaturedActive() {
    const active = activeEvents();
    if (!active.length) return;
    if (!active.some((ev) => ev.featured)) {
      active[0].featured = true;
    }
  }

  function eventCardHtml(ev, { archived }) {
    return `<article class="admin-card">
      <div class="admin-card-top">
        <div>
          <h3>${escapeHtml(ev.title || "Untitled event")}</h3>
          <p class="admin-card-meta">${
            archived
              ? "In past-events archive"
              : ev.featured
                ? "Shown on home page · "
                : ""
          }${escapeHtml(ev.dateLabel || "No date set")}</p>
          <p>${escapeHtml(ev.lede || "")}</p>
        </div>
        <div class="admin-card-actions">
          <button type="button" class="admin-btn admin-btn--ghost" data-edit-event="${escapeHtml(ev.id)}">Edit</button>
          ${
            archived
              ? `<button type="button" class="admin-btn admin-btn--ghost" data-restore-event="${escapeHtml(ev.id)}">Restore</button>`
              : `<button type="button" class="admin-btn admin-btn--ghost" data-archive-event="${escapeHtml(ev.id)}">Move to archive</button>`
          }
          <button type="button" class="admin-btn admin-btn--danger" data-del-event="${escapeHtml(ev.id)}">Delete</button>
        </div>
      </div>
    </article>`;
  }

  function renderEvent() {
    if (!Array.isArray(state.event)) {
      state.event = state.event
        ? [{ id: "legacy-event", featured: true, archived: false, ...state.event }]
        : [];
    }
    state.event.forEach((ev) => {
      if (typeof ev.archived !== "boolean") ev.archived = false;
    });

    const current = activeEvents();
    const past = archivedEvents();
    const currentList = current.map((ev) => eventCardHtml(ev, { archived: false })).join("");
    const pastList = past.map((ev) => eventCardHtml(ev, { archived: true })).join("");

    const editing =
      editingEventId != null
        ? state.event.find((ev) => ev.id === editingEventId) || blankEvent()
        : null;
    const isExisting =
      editing && editingEventId && state.event.some((ev) => ev.id === editingEventId);
    const editor = editing ? eventEditorHtml(editing, isExisting) : "";

    panels.innerHTML = `
      <div class="admin-toolbar">
        <h2>Current events</h2>
        <button type="button" class="admin-btn" id="event-add">Add event</button>
      </div>
      <p class="admin-field-hint" style="margin:-4px 0 14px">These show on the site. Use <strong>Move to archive</strong> when an event is over — it stays for history unless you Delete it.</p>
      <div class="admin-list">${currentList || "<p class='admin-status'>No current events. Click Add event to create one.</p>"}</div>
      ${editing && !editing.archived ? editor : ""}
      <div class="admin-toolbar" style="margin-top:28px">
        <h2>Past events archive</h2>
      </div>
      <p class="admin-field-hint" style="margin:-4px 0 14px">Historic events for the public Past events section. <strong>Restore</strong> brings one back to Current. <strong>Delete</strong> removes it for good.</p>
      <div class="admin-list">${pastList || "<p class='admin-status'>Archive is empty.</p>"}</div>
      ${editing && editing.archived ? editor : ""}`;

    wireEventHandlers();
    if (editing != null) {
      wireBrowseUploads();
      scrollToEditor();
    }
  }

  function eventEditorHtml(editing, isExisting) {
    return `<div class="admin-editor">
      <h3>${isExisting ? "Edit event" : "New event"}</h3>
      <p class="admin-field-hint" style="margin:-6px 0 16px">Fill in what you know. Leave optional fields blank if you don’t need them.</p>
      <form id="event-form">
        <input type="hidden" name="id" value="${escapeHtml(editing.id)}" />
        <div class="admin-field">
          <label for="e-title">Event name</label>
          <input id="e-title" name="title" value="${escapeHtml(editing.title || "")}" required placeholder="e.g. Annual Dinner &amp; Ceremony" />
        </div>
        <div class="admin-row-2">
          <div class="admin-field">
            <label for="e-dateLabel">When</label>
            <input id="e-dateLabel" name="dateLabel" value="${escapeHtml(editing.dateLabel || "")}" placeholder="e.g. Tuesday, June 16, 2026" />
          </div>
          <div class="admin-field">
            <label for="e-eyebrow">Small label <span class="admin-optional">(optional)</span></label>
            <input id="e-eyebrow" name="eyebrow" value="${escapeHtml(editing.eyebrow || "")}" placeholder="e.g. Upcoming, Free, Members only" />
          </div>
        </div>
        <div class="admin-field">
          <label for="e-lede">Short description</label>
          <textarea id="e-lede" name="lede" placeholder="A sentence or two about the event">${escapeHtml(editing.lede || "")}</textarea>
        </div>
        <div class="admin-field">
          <label>Extra line <span class="admin-optional">(optional)</span></label>
          <p class="admin-field-hint" style="margin:0 0 8px">Use for inductees, speakers, location, or anything else worth calling out. Leave blank if not needed.</p>
          <div class="admin-row-2">
            <input name="inducteesLabel" value="${escapeHtml(editing.inducteesLabel || "")}" placeholder="Label — e.g. Speakers, Location" />
            <input name="inductees" value="${escapeHtml(editing.inductees || "")}" placeholder="The details" />
          </div>
        </div>
        <div class="admin-row-2">
          <div class="admin-field">
            <label for="e-ticketUrl">Ticket or RSVP link <span class="admin-optional">(optional)</span></label>
            <input id="e-ticketUrl" name="ticketUrl" value="${escapeHtml(editing.ticketUrl || "")}" placeholder="https://" />
          </div>
          <div class="admin-field">
            <label for="e-ticketLabel">Button text</label>
            <input id="e-ticketLabel" name="ticketLabel" value="${escapeHtml(editing.ticketLabel || "Buy Tickets")}" placeholder="Buy Tickets" />
          </div>
        </div>
        ${pathFieldHtml({
          id: "e-image",
          name: "image",
          value: editing.image || "",
          label: "Photo (optional)",
          folder: "assets",
          placeholder: "Choose a photo with Browse…",
          hint: "Used on the News & Events page. Click Browse to upload from your computer, then Apply and Save.",
        })}
        ${
          editing.archived
            ? `<p class="admin-field-hint">This event is in the past-events archive. Restore it to feature it on the home page again.</p>`
            : `<label class="admin-check"><input type="checkbox" name="featured" ${editing.featured ? "checked" : ""} /> Feature this on the home page (and the big banner on News &amp; Events)</label>`
        }
        <div class="admin-actions">
          <button type="submit" class="admin-btn">Apply to list</button>
          <button type="button" class="admin-btn admin-btn--ghost" id="event-cancel">Cancel</button>
        </div>
      </form>
    </div>`;
  }

  function wireEventHandlers() {
    document.getElementById("event-add")?.addEventListener("click", () => {
      editingEventId = "";
      render();
    });
    document.getElementById("event-cancel")?.addEventListener("click", () => {
      editingEventId = null;
      render();
    });
    document.getElementById("event-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = String(fd.get("title") || "").trim();
      const existingId = String(fd.get("id") || "").trim();
      const was = state.event.find((ev) => ev.id === editingEventId);
      const archived = was ? !!was.archived : false;
      const item = {
        id: existingId || slugify(title),
        featured: archived ? false : fd.get("featured") === "on",
        archived,
        eyebrow: String(fd.get("eyebrow") || "").trim(),
        title,
        lede: String(fd.get("lede") || "").trim(),
        dateLabel: String(fd.get("dateLabel") || "").trim(),
        inducteesLabel: String(fd.get("inducteesLabel") || "").trim(),
        inductees: String(fd.get("inductees") || "").trim(),
        ticketUrl: String(fd.get("ticketUrl") || "").trim(),
        ticketLabel: String(fd.get("ticketLabel") || "Buy Tickets").trim() || "Buy Tickets",
        image: String(fd.get("image") || "").trim(),
      };
      if (item.featured) {
        state.event.forEach((ev) => {
          ev.featured = false;
        });
      }
      const idx = state.event.findIndex((ev) => ev.id === editingEventId);
      if (idx >= 0) state.event[idx] = item;
      else {
        const clash = state.event.findIndex((ev) => ev.id === item.id);
        if (clash >= 0) state.event[clash] = { ...state.event[clash], ...item };
        else state.event.unshift(item);
      }
      ensureFeaturedActive();
      editingEventId = null;
      setStatus(appStatus, "Events updated. Click Save to publish.", "is-ok");
      render();
    });
    panels.querySelectorAll("[data-edit-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingEventId = btn.getAttribute("data-edit-event");
        render();
      });
    });
    panels.querySelectorAll("[data-archive-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-archive-event");
        const item = state.event.find((ev) => ev.id === id);
        if (!item) return;
        item.archived = true;
        item.featured = false;
        if (editingEventId === id) editingEventId = null;
        ensureFeaturedActive();
        setStatus(appStatus, "Moved to archive. Saving…", "is-ok");
        render();
        beginSave();
      });
    });
    panels.querySelectorAll("[data-restore-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-restore-event");
        const item = state.event.find((ev) => ev.id === id);
        if (!item) return;
        item.archived = false;
        if (editingEventId === id) editingEventId = null;
        ensureFeaturedActive();
        setStatus(appStatus, "Restored to current events. Saving…", "is-ok");
        render();
        beginSave();
      });
    });
    panels.querySelectorAll("[data-del-event]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del-event");
        const item = state.event.find((ev) => ev.id === id);
        const ok = await confirmDelete(item?.title || "this event");
        if (!ok) return;
        if (editingEventId === id) editingEventId = null;
        state.event = state.event.filter((ev) => ev.id !== id);
        ensureFeaturedActive();
        setStatus(appStatus, "Removed. Saving…", "is-ok");
        render();
        beginSave();
      });
    });
  }

  function renderBrands(kind) {
    const items = state[kind] || [];
    const label = kind === "partners" ? "Partners" : "Sponsors";
    const singular = kind === "partners" ? "partner" : "sponsor";
    const list = items
      .map(
        (b) => `<article class="admin-card">
          <div class="admin-card-top">
            <div>
              <h3>${escapeHtml(b.name)}</h3>
              <p class="admin-card-meta">${escapeHtml(b.domain || b.url || "")}</p>
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
    const isExisting =
      editing && editingBrand.id && items.some((b) => b.id === editingBrand.id);

    panels.innerHTML = `
      <div class="admin-toolbar">
        <h2>${label}</h2>
        <button type="button" class="admin-btn" id="brand-add">Add ${singular}</button>
      </div>
      <div class="admin-list">${list || `<p class='admin-status'>None yet. Click Add ${singular} to create one.</p>`}</div>
      ${
        editing
          ? `<div class="admin-editor">
        <h3>${isExisting ? `Edit ${singular}` : `New ${singular}`}</h3>
        <p class="admin-field-hint" style="margin:-6px 0 16px">Add their name, website, and logo. That’s all that’s required.</p>
        <form id="brand-form">
          <input type="hidden" name="id" value="${escapeHtml(editing.id)}" />
          <div class="admin-field">
            <label for="b-name">Name</label>
            <input id="b-name" name="name" value="${escapeHtml(editing.name)}" required placeholder="e.g. City of Mobile" />
          </div>
          <div class="admin-field">
            <label for="b-url">Website link</label>
            <input id="b-url" name="url" value="${escapeHtml(editing.url || "")}" placeholder="https://" />
          </div>
          ${pathFieldHtml({
            id: "b-logo",
            name: "logo",
            value: editing.logo || "",
            label: "Logo",
            folder: `assets/${kind}`,
            placeholder: "Choose a logo with Browse…",
            hint: "Click Browse to upload their logo from your computer, then Apply and Save.",
          })}
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
      const name = String(fd.get("name") || "").trim();
      const url = String(fd.get("url") || "").trim();
      const existingId = String(fd.get("id") || "").trim();
      const existing = items.find((b) => b.id === editingBrand.id);
      const item = {
        id: existingId || slugify(name),
        name,
        url,
        logo: String(fd.get("logo") || "").trim(),
        domain:
          domainFromUrl(url) ||
          (existing && existing.domain) ||
          "",
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
      setStatus(appStatus, `${label} updated. Click Save to publish.`, "is-ok");
      render();
    });
    panels.querySelectorAll("[data-edit-brand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingBrand = { kind, id: btn.getAttribute("data-edit-brand") };
        render();
      });
    });
    panels.querySelectorAll("[data-del-brand]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-del-brand");
        const item = state[kind].find((b) => b.id === id);
        const ok = await confirmDelete(item?.name || `this ${singular}`);
        if (!ok) return;
        if (editingBrand.kind === kind && editingBrand.id === id) {
          editingBrand = { kind: null, id: null };
        }
        state[kind] = state[kind].filter((b) => b.id !== id);
        setStatus(appStatus, "Removed. Saving…", "is-ok");
        render();
        beginSave();
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
      .map((o) => `${o.name} — ${o.title || ""}`.replace(/\s—\s$/, ""))
      .join("\n");
    const membersText = (b.members || []).join("\n");

    panels.innerHTML = `
      <div class="admin-toolbar"><h2>Board members</h2></div>
      <div class="admin-editor">
        <p class="admin-field-hint" style="margin:0 0 16px">Update the board page title, intro, officers, and member list.</p>
        <form id="board-form">
          <div class="admin-field">
            <label for="bd-title">Page heading</label>
            <input id="bd-title" name="title" value="${escapeHtml(b.title || "")}" placeholder="e.g. Board of Directors 2025" />
          </div>
          <div class="admin-field">
            <label for="bd-lede">Short intro</label>
            <textarea id="bd-lede" name="lede" placeholder="A sentence under the heading">${escapeHtml(b.lede || "")}</textarea>
          </div>
          <div class="admin-field">
            <label for="bd-officers">Officers</label>
            <p class="admin-field-hint" style="margin:0 0 8px">One per line. Use a dash between name and title, like: Jane Doe — President</p>
            <textarea id="bd-officers" name="officers" rows="4">${escapeHtml(officersText)}</textarea>
          </div>
          <div class="admin-field">
            <label for="bd-members">Board members</label>
            <p class="admin-field-hint" style="margin:0 0 8px">One name per line</p>
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
          const parts = line.split(/\s+[—\-|]\s+/);
          const name = (parts[0] || "").trim();
          const title = parts.slice(1).join(" — ").trim();
          return { name, title };
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
      setStatus(appStatus, "Board updated. Click Save to publish.", "is-ok");
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
