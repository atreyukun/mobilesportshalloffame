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

  let inductees = [];
  let activeLetter = "ALL";
  let query = "";

  try {
    const res = await fetch("data/inductees.json");
    inductees = await res.json();
  } catch (err) {
    if (grid) grid.innerHTML = "<p class='hof-empty'>Unable to load inductees.</p>";
    return;
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  if (letters) {
    letters.innerHTML =
      `<button type="button" class="hof-letter is-active" data-letter="ALL">All</button>` +
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
      render();
    });
  }

  function render() {
    const filtered = inductees.filter((p) => {
      const letterOk = activeLetter === "ALL" || p.letter === activeLetter;
      const qOk =
        !query ||
        p.name.toLowerCase().includes(query) ||
        String(p.year).includes(query) ||
        (p.summary || "").toLowerCase().includes(query);
      return letterOk && qOk;
    });

    if (count) {
      count.textContent = `${filtered.length} inductee${filtered.length === 1 ? "" : "s"}`;
    }

    if (!grid) return;

    if (!filtered.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;
    grid.innerHTML = filtered
      .map(
        (p) => `
      <article class="hof-card">
        <div class="hof-card-year">${p.year}</div>
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.summary || "")}</p>
      </article>`
      )
      .join("");
  }

  render();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
