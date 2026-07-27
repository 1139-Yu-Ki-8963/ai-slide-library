(() => {
  "use strict";

  const legacyShell = document.querySelector(
    ".pager, .page-nav, footer.slide-meta:not([data-shared-slide-footer]), nav.slide-pager:not([data-shared-slide-pager])",
  );
  if (legacyShell) {
    throw new Error(`Local slide shell markup is not allowed: ${legacyShell.outerHTML.slice(0, 120)}`);
  }

  const pages = [...document.querySelectorAll("[data-slide-page]")];
  if (!pages.length) throw new Error("No canonical [data-slide-page] was found");
  if (document.querySelector(".slide-page:not([data-slide-page]), .slide[data-page]:not([data-slide-page])")) {
    throw new Error("An unclassified logical slide page was found");
  }

  const surfaces = [...new Set(pages.map(page => (
    page.matches(".slide") ? page : page.closest(".slide")
  )))];
  if (surfaces.some(surface => !surface)) throw new Error("A logical page has no .slide surface");

  for (const surface of surfaces) {
    const footer = document.createElement("footer");
    footer.className = "slide-meta";
    footer.dataset.sharedSlideFooter = "";
    footer.setAttribute("aria-label", "資料情報");
    surface.append(footer);
  }

  let currentIndex = 0;
  const showPage = index => {
    currentIndex = Math.max(0, Math.min(index, pages.length - 1));
    for (const [pageIndex, page] of pages.entries()) {
      const active = pageIndex === currentIndex;
      page.classList.toggle("is-active", active);
      page.hidden = !active;
      page.setAttribute("aria-hidden", String(!active));
    }
  };

  if (pages.length > 1) {
    const navigation = document.createElement("nav");
    navigation.className = "slide-pager";
    navigation.dataset.sharedSlidePager = "";
    navigation.setAttribute("aria-label", "スライドページ");
    navigation.innerHTML = [
      '<button type="button" data-slide-pager-prev aria-label="前のページ">←</button>',
      '<span class="slide-pager-count" aria-live="polite">',
      '<span data-slide-pager-current>1</span>',
      '<span aria-hidden="true"> / </span>',
      `<span data-slide-pager-total>${pages.length}</span>`,
      "</span>",
      '<button type="button" data-slide-pager-next aria-label="次のページ">→</button>',
    ].join("");

    const previous = navigation.querySelector("[data-slide-pager-prev]");
    const next = navigation.querySelector("[data-slide-pager-next]");
    const current = navigation.querySelector("[data-slide-pager-current]");

    const render = index => {
      showPage(index);
      current.textContent = String(currentIndex + 1);
      previous.disabled = currentIndex === 0;
      next.disabled = currentIndex === pages.length - 1;
    };

    previous.addEventListener("click", () => render(currentIndex - 1));
    next.addEventListener("click", () => render(currentIndex + 1));
    document.addEventListener("keydown", event => {
      if (event.defaultPrevented || /^(?:INPUT|TEXTAREA|SELECT|BUTTON)$/.test(event.target?.tagName ?? "")) return;
      if (event.key === "ArrowLeft") render(currentIndex - 1);
      if (event.key === "ArrowRight") render(currentIndex + 1);
    });

    document.body.append(navigation);
    render(0);
  } else {
    showPage(0);
  }

  const updateScale = () => {
    const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    document.documentElement.style.setProperty("--slide-scale", String(scale));
  };
  updateScale();
  window.addEventListener("resize", updateScale, { passive: true });

  document.documentElement.dataset.sharedSlideShellReady = "true";
  document.dispatchEvent(new CustomEvent("shared-slide-shell-ready", {
    detail: { pageCount: pages.length },
  }));
})();
