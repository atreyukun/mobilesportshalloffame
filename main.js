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
})();

async function initHof(root) {
  const grid = root.querySelector("[data-hof-grid]");
  const search = root.querySelector("[data-hof-search]");
  const letters = root.querySelector("[data-hof-letters]");
  const count = root.querySelector("[data-hof-count]");
  const empty = root.querySelector("[data-hof-empty]");
  const modal = document.getElementById("hof-modal");

  let inductees = [];
  let activeLetter = null; // nothing selected by default
  let query = "";

  try {
    const res = await fetch("data/inductees.json");
    inductees = await res.json();
  } catch (err) {
    if (grid) grid.innerHTML = "<p class='hof-empty'>Unable to load inductees.</p>";
    return;
  }

  // Index by last-name initial (standard directory style)
  inductees.forEach((p) => {
    p.letter = lastNameLetter(p.name);
  });

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
    video.pause();
    video.removeAttribute("src");
    video.load();
    image.removeAttribute("src");
    image.hidden = true;
    video.hidden = true;
    fallback.hidden = true;

    if (person.video) {
      video.hidden = false;
      video.src = person.video;
      video.muted = true;
      const play = video.play();
      if (play && typeof play.catch === "function") play.catch(() => {});
    } else if (person.image) {
      image.hidden = false;
      image.src = person.image;
      image.alt = title;
    } else {
      fallback.hidden = false;
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
          ? Boolean(query) // only show results before a letter pick if user is searching
          : activeLetter === "ALL" || p.letter === activeLetter;
      const qOk =
        !query ||
        p.name.toLowerCase().includes(query) ||
        String(p.year).includes(query) ||
        (p.summary || "").toLowerCase().includes(query);
      return letterOk && qOk;
    });
    filteredCache = filtered;

    if (count) {
      if (activeLetter == null && !query) {
        count.textContent = "Select a letter to browse";
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
          activeLetter == null && !query
            ? "Choose a letter to browse inductees by last name."
            : "No inductees match your search.";
      }
      return;
    }

    if (empty) empty.hidden = true;
    grid.innerHTML = filtered
      .map(
        (p, i) => `
      <article class="hof-card">
        <button type="button" class="hof-card-hit" data-hof-open="${i}" aria-label="View ${escapeHtml(p.displayName || p.name)}">
          ${
            p.image
              ? `<div class="hof-card-thumb"><img src="${escapeHtml(p.image)}" alt="" loading="lazy" /></div>`
              : ""
          }
          <div class="hof-card-year">${p.year}</div>
          <h3>${escapeHtml(p.name)}</h3>
          <p>${escapeHtml(p.summary || "")}</p>
          <span class="hof-card-more">Read more</span>
        </button>
      </article>`
      )
      .join("");
  }

  render();
}

/** First letter of last name (skips Jr/Sr/II/III/IV). */
function lastNameLetter(name) {
  const parts = String(name)
    .toUpperCase()
    .replace(/[“”"‘’']/g, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const suffixes = new Set(["JR", "SR", "II", "III", "IV", "V"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) {
    parts.pop();
  }
  const last = parts[parts.length - 1] || "";
  const m = last.match(/[A-Z]/);
  return m ? m[0] : "#";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
