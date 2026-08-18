(() => {
  const header = document.querySelector(".site-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const dropdowns = document.querySelectorAll(".nav-item--dropdown");

  // Mobile menu
  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
      menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
  }

  // Dropdowns (click for touch / mobile)
  dropdowns.forEach((item) => {
    const trigger = item.querySelector(".nav-dropdown-trigger");
    if (!trigger) return;
    trigger.addEventListener("click", (e) => {
      if (window.matchMedia("(max-width: 960px)").matches || trigger.tagName === "BUTTON") {
        e.preventDefault();
        const wasOpen = item.classList.contains("is-open");
        dropdowns.forEach((d) => d.classList.remove("is-open"));
        if (!wasOpen) item.classList.add("is-open");
        trigger.setAttribute("aria-expanded", (!wasOpen).toString());
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-item--dropdown")) {
      dropdowns.forEach((d) => d.classList.remove("is-open"));
    }
  });

  // Close mobile nav on link click
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", () => {
      document.body.classList.remove("nav-open");
      if (menuToggle) {
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open menu");
      }
    });
  });

  // Header scroll state
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("site-header--scrolled", window.scrollY > 12);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Home hero — scroll-scrubbed collage (PepsiCo-style)
  initHeroScrub();

  // Reveal on scroll
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  // Hall of Famers directory
  const hofRoot = document.getElementById("hof-directory");
  if (hofRoot) {
    initHof(hofRoot);
  }

  const newsHome = document.querySelector("[data-news-home]");
  if (newsHome) initNews(newsHome, { home: true });

  const featuredNews = document.querySelector("[data-featured-news]");
  if (featuredNews) initFeaturedNews(featuredNews);

  const newsArchive = document.querySelector("[data-news-archive]");
  if (newsArchive) initNews(newsArchive, { home: false });

  const featuredEvent = document.querySelector("[data-featured-event]");
  if (featuredEvent) initFeaturedEvent(featuredEvent);

  const eventsList = document.querySelector("[data-events-list]");
  if (eventsList) initEventsList(eventsList);

  const eventsArchive = document.querySelector("[data-events-archive]");
  if (eventsArchive) initEventsArchive(eventsArchive);

  const partnersGrid = document.querySelector("[data-partners-grid]");
  if (partnersGrid) initBrandGrid(partnersGrid, "data/partners.json");

  const sponsorsGrid = document.querySelector("[data-sponsors-grid]");
  if (sponsorsGrid) initBrandGrid(sponsorsGrid, "data/sponsors.json");

  const boardRoster = document.querySelector("[data-board-roster]");
  if (boardRoster) initBoard(boardRoster);

  // Inquiry form. The site is static, so the form hands the message off to the
  // visitor's own mail client rather than posting anywhere.
  const inquiryForm = document.querySelector("[data-inquiry-form]");
  if (inquiryForm) {
    initInquiryForm(inquiryForm);
  }
})();

function initInquiryForm(form) {
  const status = form.querySelector("[data-inquiry-status]");
  const to = form.dataset.inquiryTo;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const field = (name) => (form.elements[name]?.value || "").trim();
    const topic = field("topic") || "General inquiry";
    const subject = `${topic} — Mobile Sports Hall of Fame`;
    const lines = [`Name: ${field("name")}`, `Email: ${field("email")}`];
    if (field("phone")) lines.push(`Phone: ${field("phone")}`);
    lines.push(`Topic: ${topic}`, "", field("message"));

    window.location.href = `mailto:${to}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(lines.join("\n"))}`;

    if (status) {
      status.textContent =
        "Your email app should open with this inquiry ready to send.";
    }
  });
}

// Bumped whenever the inductee photos are re-exported, so browsers holding an
// older copy of a same-named file fetch the new one.
const PHOTO_VERSION = 13;

function photoUrl(path) {
  return `${path}?v=${PHOTO_VERSION}`;
}

function initHeroScrub() {
  const root = document.querySelector("[data-hero-scrub]");
  if (!root) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const marquees = root.querySelector("[data-hero-marquees]");
  const content = root.querySelector("[data-hero-content]");
  const overlay = root.querySelector("[data-hero-overlay]");
  if (!marquees) return;

  let ticking = false;

  const update = () => {
    ticking = false;
    const rect = root.getBoundingClientRect();
    const runway = Math.max(root.offsetHeight - window.innerHeight, 1);
    const scrolled = Math.min(Math.max(-rect.top, 0), runway);
    // Ease the scrub so early scroll moves slowly
    const raw = scrolled / runway;
    const t = raw * raw * (3 - 2 * raw); // smoothstep

    // Gentle left/right drift — keep this low so rows don't whip past
    marquees.style.setProperty("--marquee-shift", `${t * 12}%`);

    if (content) {
      content.style.transform = `translate3d(0, ${t * -18}px, 0)`;
      content.style.opacity = String(Math.max(0.15, 1 - t * 0.55));
    }
    if (overlay) {
      overlay.style.opacity = String(0.95 + t * 0.12);
    }
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
}

async function initHof(root) {
  const grid = root.querySelector("[data-hof-grid]");
  const search = root.querySelector("[data-hof-search]");
  const letters = root.querySelector("[data-hof-letters]");
  const sportsEl = root.querySelector("[data-hof-sports]");
  const count = root.querySelector("[data-hof-count]");
  const empty = root.querySelector("[data-hof-empty]");
  const modal = document.getElementById("hof-modal");

  let inductees = [];
  let activeLetter = null; // nothing selected by default
  let activeSport = "ALL";
  let query = "";

  try {
    const res = await fetch("data/inductees.json");
    inductees = await res.json();
  } catch (err) {
    if (grid) grid.innerHTML = "<p class='hof-empty'>Unable to load inductees.</p>";
    return;
  }

  // Index by last-name initial and sort within letters by last name, then first
  inductees.forEach((p) => {
    p.letter = lastNameLetter(p.name);
    p._sort = nameSortKey(p.name);
    p.sports = Array.isArray(p.sports) ? p.sports : inferSports(p);
  });
  inductees.sort((a, b) => {
    if (a.letter !== b.letter) return a.letter < b.letter ? -1 : 1;
    if (a._sort !== b._sort) return a._sort < b._sort ? -1 : 1;
    return 0;
  });

  const sportCounts = new Map();
  inductees.forEach((p) => {
    (p.sports || []).forEach((s) => sportCounts.set(s, (sportCounts.get(s) || 0) + 1));
  });
  const sportList = [...sportCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);

  if (sportsEl) {
    sportsEl.innerHTML =
      `<button type="button" class="hof-sport is-active" data-sport="ALL">All sports</button>` +
      sportList
        .map(
          (s) =>
            `<button type="button" class="hof-sport" data-sport="${escapeHtml(s)}">${escapeHtml(s)}</button>`
        )
        .join("");

    sportsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sport]");
      if (!btn) return;
      activeSport = btn.dataset.sport;
      sportsEl.querySelectorAll(".hof-sport").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      render();
    });
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  if (letters) {
    letters.innerHTML =
      `<button type="button" class="hof-letter" data-letter="ALL">All</button>` +
      alphabet
        .map((l) => `<button type="button" class="hof-letter" data-letter="${l}">${l}</button>`)
        .join("");

    letters.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-letter]");
      if (!btn) return;
      activeLetter = btn.dataset.letter;
      letters.querySelectorAll(".hof-letter").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      render();
    });
  }

  if (search) {
    search.addEventListener("input", () => {
      query = search.value.trim().toLowerCase();
      // Searching without a letter selected still works across everyone
      render();
    });
  }

  function openModal(person) {
    if (!modal) return;
    const title = person.displayName || person.name;
    const banner = (person.displayName || person.name).replace(/[“”"]/g, "").toUpperCase();
    const bioText = person.bio || person.summary || "";

    modal.querySelector("[data-hof-modal-title]").textContent = title;
    modal.querySelector("[data-hof-modal-banner]").textContent = banner;
    modal.querySelector("[data-hof-modal-year]").textContent = `Inducted ${person.year}`;
    modal.querySelector("[data-hof-modal-bio]").innerHTML = bioText
      .split(/\n+/)
      .filter(Boolean)
      .map((para) => `<p>${escapeHtml(para)}</p>`)
      .join("");

    const video = modal.querySelector("[data-hof-modal-video]");
    const image = modal.querySelector("[data-hof-modal-image]");
    const fallback = modal.querySelector("[data-hof-modal-fallback]");
    const crest = modal.querySelector(".hof-modal-crest");
    video.pause();
    video.removeAttribute("src");
    video.load();
    image.removeAttribute("src");
    image.hidden = true;
    video.hidden = true;
    fallback.hidden = true;

    // Most archive photos already have the crest burned in, and the fallback
    // tile draws its own. Only overlay a crest where the artwork lacks one.
    if (person.video) {
      video.hidden = false;
      video.src = person.video;
      video.muted = true;
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
      if (crest) crest.hidden = false;
    } else if (person.image) {
      image.hidden = false;
      image.src = photoUrl(person.image);
      image.alt = title;
      // This box is narrower than the photos, so anchor the crop away from the
      // crest rather than slicing through it.
      image.style.objectPosition =
        person.imagePosition ||
        (person.crestSide === "left"
          ? "left top"
          : person.crestSide === "right"
            ? "right top"
            : "center 22%");
      if (crest) crest.hidden = !person.crest;
    } else {
      fallback.hidden = false;
      if (crest) crest.hidden = true;
    }

    modal.hidden = false;
    document.body.classList.add("hof-modal-open");
    modal.querySelector(".hof-modal-close")?.focus();
  }

  function closeModal() {
    if (!modal) return;
    const video = modal.querySelector("[data-hof-modal-video]");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    modal.hidden = true;
    document.body.classList.remove("hof-modal-open");
  }

  if (modal) {
    modal.querySelectorAll("[data-hof-close]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) closeModal();
    });
  }

  if (grid) {
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-hof-open]");
      if (!btn) return;
      const idx = Number(btn.dataset.hofOpen);
      const person = filteredCache[idx];
      if (person) openModal(person);
    });
  }

  let filteredCache = [];

  function render() {
    const filtered = inductees.filter((p) => {
      const letterOk =
        activeLetter == null
          ? Boolean(query) || activeSport !== "ALL" // sport alone can show results
          : activeLetter === "ALL" || p.letter === activeLetter;
      const sportOk =
        activeSport === "ALL" || (p.sports || []).includes(activeSport);
      const qOk =
        !query ||
        p.name.toLowerCase().includes(query) ||
        String(p.year).includes(query) ||
        (p.summary || "").toLowerCase().includes(query) ||
        (p.sports || []).some((s) => s.toLowerCase().includes(query));
      return letterOk && sportOk && qOk;
    });
    filteredCache = filtered;

    if (count) {
      if (activeLetter == null && !query && activeSport === "ALL") {
        count.textContent = "Select a letter or sport to browse";
      } else {
        count.textContent = `${filtered.length} inductee${filtered.length === 1 ? "" : "s"}`;
      }
    }

    if (!grid) return;

    if (!filtered.length) {
      grid.innerHTML = "";
      if (empty) {
        empty.hidden = false;
        empty.textContent =
          activeLetter == null && !query && activeSport === "ALL"
            ? "Choose a letter or sport to browse inductees."
            : "No inductees match your search.";
      }
      return;
    }

    if (empty) empty.hidden = true;
    grid.innerHTML = filtered
      .map(
        (p, i) => {
          const label = escapeHtml(p.displayName || p.name);
          const thumb = p.image
            ? `<div class="hof-card-thumb"><img src="${escapeHtml(photoUrl(p.image))}" alt="" loading="lazy"${
                p.imagePosition
                  ? ` style="object-position:${escapeHtml(p.imagePosition)}"`
                  : ""
              } />${
                p.crest
                  ? `<img src="assets/crest.png?v=6" alt="" class="hof-card-crest" />`
                  : ""
              }</div>`
            : `<div class="hof-card-thumb hof-card-thumb--placeholder" aria-hidden="true">
                <span class="hof-card-placeholder-name">${label}</span>
                <img src="assets/crest.png?v=6" alt="" class="hof-card-crest" />
              </div>`;
          return `
      <article class="hof-card">
        <button type="button" class="hof-card-hit" data-hof-open="${i}" aria-label="View ${label}">
          ${thumb}
          <div class="hof-card-year">${p.year}</div>
          <h3>${label}</h3>
          <p>${escapeHtml(p.summary || "")}</p>
          <span class="hof-card-more">Read more</span>
        </button>
      </article>`;
        }
      )
      .join("");
  }

  render();
}

/** Name tokens uppercased; drops Jr/Sr/II/III/IV/V. */
function nameTokens(name) {
  const parts = String(name)
    .toUpperCase()
    .replace(/[“”"‘’']/g, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const suffixes = new Set(["JR", "SR", "II", "III", "IV", "V"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) {
    parts.pop();
  }
  return parts;
}

/** First letter of last name (skips Jr/Sr/II/III/IV). */
function lastNameLetter(name) {
  const parts = nameTokens(name);
  const last = parts[parts.length - 1] || "";
  const m = last.match(/[A-Z]/);
  return m ? m[0] : "#";
}

/** Sort key: LAST|FIRST|REST — directory-style within each letter. */
function nameSortKey(name) {
  const parts = nameTokens(name);
  if (!parts.length) return "";
  const last = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");
  return `${last}|${given}|${String(name).toUpperCase()}`;
}

/** Fallback sport tags from summary/bio when JSON has none. */
function inferSports(person) {
  const text = `${person.name || ""} ${person.summary || ""} ${person.bio || ""}`;
  const rules = [
    ["Baseball", /\bbaseball\b|\bMLB\b|Negro League|\bpitcher\b|\bWorld Series\b/i],
    ["Football", /\bfootball\b|\bNFL\b|\bquarterback\b|\bSuper Bowl\b/i],
    ["Basketball", /\bbasketball\b|\bNBA\b/i],
    ["Golf", /\bgolf\b|\bLPGA\b|\bPGA\b/i],
    ["Track & Field", /\btrack\b|\bcross country\b/i],
    ["Soccer", /\bsoccer\b/i],
    ["Volleyball", /\bvolleyball\b/i],
    ["Boxing", /\bboxing\b|\bwelterweight\b/i],
    ["Softball", /\bsoftball\b/i],
    ["Tennis", /\btennis\b/i],
    ["Swimming", /\bswim|\bdiving\b/i],
    ["Sailing", /\bsailing\b/i],
    ["Shooting", /\bskeet\b|\bmarksman\b|\bshooting\b/i],
    ["Media", /\bsportscaster\b|\bsports writer\b|\broadcaster\b/i],
  ];
  return rules.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchJson(path) {
  const res = await fetch(`${path}${path.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function initNews(root, { home }) {
  try {
    const items = await fetchJson("data/news.json");
    const featured = items.filter((n) => n.featured);
    const rest = items.filter((n) => !n.featured);
    const list = home ? [...featured, ...rest].slice(0, 2) : rest;
    const shown = list.length ? list : items.slice(0, 2);
    root.innerHTML = shown
      .map((n) => {
        const text = home ? n.summary : n.body || n.summary;
        const href = home ? "news-events.html" : n.link || "news-events.html";
        const label = home ? "Read more →" : n.linkLabel || "Read more →";
        const external = !home && /^https?:/i.test(href);
        const featuredMark = n.featured
          ? `<p class="news-item-eyebrow">Featured</p>`
          : "";
        return `<article class="news-item${n.featured ? " news-item--featured" : ""} reveal is-visible">
          ${featuredMark}
          <h3>${escapeHtml(n.title)}</h3>
          <p>${escapeHtml(text)}</p>
          <a class="more" href="${escapeHtml(href)}"${
            external ? ' target="_blank" rel="noopener noreferrer"' : ""
          }>${escapeHtml(label)}</a>
        </article>`;
      })
      .join("");
  } catch (err) {
    root.innerHTML = "<p class='hof-empty'>Unable to load news.</p>";
  }
}

async function initFeaturedNews(root) {
  try {
    const items = await fetchJson("data/news.json");
    const story = (items || []).find((n) => n.featured);
    const section = root.closest("[data-featured-news-section]") || root.closest("section");
    if (!story) {
      root.innerHTML = "";
      section?.setAttribute("hidden", "");
      return;
    }
    section?.removeAttribute("hidden");
    const href = story.link || "news-events.html";
    const external = /^https?:/i.test(href);
    const label = story.linkLabel || "Read more →";
    const photo = story.image
      ? `<img src="${escapeHtml(story.image)}" alt="${escapeHtml(story.title || "")}" class="featured-news-photo" />`
      : `<img src="assets/crest.png?v=6" alt="" class="featured-news-crest" />`;
    root.innerHTML = `
      <div class="event-band-media featured-news-media${story.image ? " featured-news-media--photo" : ""}">
        ${photo}
      </div>
      <div>
        <p class="section-eyebrow" style="color:rgba(255,255,255,0.55)">Featured news</p>
        <h2 class="section-title">${escapeHtml(story.title || "")}</h2>
        <p class="section-lede" style="color:rgba(255,255,255,0.72)">${escapeHtml(
          story.body || story.summary || ""
        )}</p>
        <a class="btn btn-white" href="${escapeHtml(href)}"${
          external ? ' target="_blank" rel="noopener noreferrer"' : ""
        }>${escapeHtml(label)}</a>
      </div>`;
  } catch (err) {
    root.innerHTML = "<p class='hof-empty' style='color:#fff'>Unable to load news.</p>";
  }
}

async function initFeaturedEvent(root) {
  try {
    const data = await fetchJson("data/event.json");
    const list = Array.isArray(data) ? data : data ? [data] : [];
    const active = list.filter((e) => !e.archived);
    const ev = active.find((e) => e.featured) || active[0];
    if (!ev) {
      root.innerHTML = "";
      root.closest("section")?.setAttribute("hidden", "");
      return;
    }
    root.closest("section")?.removeAttribute("hidden");
    const home = root.getAttribute("data-event-layout") === "home";
    const img = ev.image || "assets/hero-banquet-pano.jpg?v=2";
    const media = home
      ? `<div class="event-band-media">
          <video src="assets/event-rsa-tower.mp4" muted playsinline loop autoplay preload="metadata" aria-label="RSA Tower in Mobile"></video>
        </div>`
      : `<div class="event-band-media event-band-media--scroll" aria-hidden="true">
          <div class="pillar-scroll-track">
            <img src="${escapeHtml(img)}" alt="" class="pillar-scroll-img" />
            <img src="${escapeHtml(img)}" alt="" class="pillar-scroll-img" />
          </div>
        </div>`;
    const chips = [
      ev.dateLabel ? `<span class="event-chip">${escapeHtml(ev.dateLabel)}</span>` : "",
      !home && ev.eyebrow ? `<span class="event-chip">${escapeHtml(ev.eyebrow)}</span>` : "",
    ]
      .filter(Boolean)
      .join("");
    const detail =
      ev.inductees || ev.inducteesLabel
        ? `<p class="inductee-list">${
            ev.inducteesLabel
              ? `<strong style="color:#fff;font-weight:600">${escapeHtml(ev.inducteesLabel)}</strong> `
              : ""
          }${escapeHtml(ev.inductees || "")}</p>`
        : "";
    root.innerHTML = `
      ${media}
      <div>
        <p class="section-eyebrow" style="color:rgba(255,255,255,0.55)">${escapeHtml(
          home && ev.dateLabel ? ev.dateLabel : ev.eyebrow || ev.dateLabel || "Upcoming"
        )}</p>
        <h2 class="section-title">${escapeHtml(ev.title || "")}</h2>
        <p class="section-lede" style="color:rgba(255,255,255,0.72)">${escapeHtml(ev.lede || "")}</p>
        ${chips ? `<div class="event-meta">${chips}</div>` : ""}
        ${detail}
        ${
          ev.ticketUrl
            ? `<a href="${escapeHtml(ev.ticketUrl)}" class="btn btn-white" target="_blank" rel="noopener noreferrer">${escapeHtml(
                ev.ticketLabel || "Buy Tickets"
              )}</a>`
            : ""
        }
      </div>`;
  } catch (err) {
    root.innerHTML = "<p class='hof-empty' style='color:#fff'>Unable to load event.</p>";
  }
}

function eventCardPublic(ev) {
  const ticket = ev.ticketUrl
    ? `<a class="more" href="${escapeHtml(ev.ticketUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        ev.ticketLabel || "Buy Tickets →"
      )}</a>`
    : "";
  const photo = ev.image
    ? `<div class="event-list-photo"><img src="${escapeHtml(ev.image)}" alt="" loading="lazy" /></div>`
    : "";
  return `<article class="news-item news-item--event reveal is-visible">
    ${photo}
    <div class="news-item-body">
      <h3>${escapeHtml(ev.title || "Event")}</h3>
      ${ev.dateLabel ? `<p class="event-list-date">${escapeHtml(ev.dateLabel)}</p>` : ""}
      <p>${escapeHtml(ev.lede || "")}</p>
      ${
        ev.inductees || ev.inducteesLabel
          ? `<p>${
              ev.inducteesLabel ? `<strong>${escapeHtml(ev.inducteesLabel)}</strong> ` : ""
            }${escapeHtml(ev.inductees || "")}</p>`
          : ""
      }
      ${ticket}
    </div>
  </article>`;
}

async function initEventsList(root) {
  try {
    const data = await fetchJson("data/event.json");
    const list = Array.isArray(data) ? data : data ? [data] : [];
    const others = list.filter((e) => !e.archived && !e.featured);
    const section = root.closest("section");
    if (!others.length) {
      if (section) section.hidden = true;
      root.innerHTML = "";
      return;
    }
    if (section) section.hidden = false;
    root.innerHTML = others.map(eventCardPublic).join("");
  } catch (err) {
    root.innerHTML = "<p class='hof-empty'>Unable to load events.</p>";
  }
}

async function initEventsArchive(root) {
  try {
    const data = await fetchJson("data/event.json");
    const list = Array.isArray(data) ? data : data ? [data] : [];
    const past = list.filter((e) => e.archived);
    const section = root.closest("section");
    if (!past.length) {
      if (section) section.hidden = true;
      root.innerHTML = "";
      return;
    }
    if (section) section.hidden = false;
    root.innerHTML = past.map(eventCardPublic).join("");
  } catch (err) {
    root.innerHTML = "<p class='hof-empty'>Unable to load past events.</p>";
  }
}

async function initBrandGrid(root, path) {
  try {
    const items = await fetchJson(path);
    root.innerHTML = items
      .map((b) => {
        const logo = b.logo
          ? `<img src="${escapeHtml(b.logo)}" alt="" />`
          : "";
        return `<a class="brand-link${b.logo ? "" : " brand-link--text"}" href="${escapeHtml(b.url || "#")}" target="_blank" rel="noopener noreferrer">
          ${logo}
          <span>${escapeHtml(b.name || "")}</span>
          <small>${escapeHtml(b.domain || "")}</small>
        </a>`;
      })
      .join("");
  } catch (err) {
    root.innerHTML = "<p class='hof-empty'>Unable to load listings.</p>";
  }
}

async function initBoard(root) {
  try {
    const data = await fetchJson("data/board.json");
    const officers = (data.officers || [])
      .map(
        (o) => `<article class="board-officer">
          <h3>${escapeHtml(o.name)}</h3>
          <p>${escapeHtml(o.title || "")}</p>
        </article>`
      )
      .join("");
    const members = (data.members || [])
      .map((m) => `<li>${escapeHtml(m)}</li>`)
      .join("");
    root.innerHTML = `
      <h2 class="section-title reveal is-visible">${escapeHtml(data.title || "Board of Directors")}</h2>
      <p class="section-lede reveal is-visible">${escapeHtml(data.lede || "")}</p>
      <div class="board-officers reveal is-visible">${officers}</div>
      <ul class="board-roster reveal is-visible">${members}</ul>`;
  } catch (err) {
    root.innerHTML = "<p class='hof-empty'>Unable to load board roster.</p>";
  }
}
