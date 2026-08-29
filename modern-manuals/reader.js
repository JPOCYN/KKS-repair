(() => {
  "use strict";

  const elements = {
    body: document.body,
    menuButton: document.getElementById("menuButton"),
    mobileContents: document.getElementById("mobileContents"),
    backdrop: document.getElementById("backdrop"),
    manualSelect: document.getElementById("manualSelect"),
    manualSearch: document.getElementById("manualSearch"),
    manualTree: document.getElementById("manualTree"),
    documentCount: document.getElementById("documentCount"),
    documentTitle: document.getElementById("documentTitle"),
    documentSubtitle: document.getElementById("documentSubtitle"),
    documentType: document.getElementById("documentType"),
    metadata: document.getElementById("metadata"),
    breadcrumbs: document.getElementById("breadcrumbs"),
    documentStatus: document.getElementById("documentStatus"),
    procedureTabs: document.getElementById("procedureTabs"),
    documentContent: document.getElementById("documentContent"),
    reader: document.querySelector(".reader"),
    readerState: document.getElementById("readerState"),
    topVehicle: document.getElementById("topVehicle"),
    topDocument: document.getElementById("topDocument"),
    themeButton: document.getElementById("themeButton"),
    printButtons: [
      document.getElementById("printButton"),
      document.getElementById("headerPrintButton"),
      document.getElementById("mobilePrint"),
    ],
    increaseText: document.getElementById("increaseText"),
    decreaseText: document.getElementById("decreaseText"),
    textScaleValue: document.getElementById("textScaleValue"),
    mobileTop: document.getElementById("mobileTop"),
  };

  const state = {
    catalog: null,
    manual: null,
    itemsById: new Map(),
    childrenByParent: new Map(),
    currentItem: null,
    currentPage: null,
    currentRequest: null,
    textScale: 1,
  };

  const pagePattern = /^(Repair|System|Wiring)\/[A-Za-z0-9._-]+\.html$/;
  const eventAttributes = /^on/i;
  const procedureTabDefinitions = [
    { legacyId: "RI_SPECIAL_ADVICE", label: "Special advice", icon: "!" },
    { legacyId: "RI_TOOLS_EQUIPMENT", label: "Tools / Equipment", icon: "⌘" },
    { legacyId: "RI_FLUIDS_LUB_ADH", label: "Fluids & lubricants", icon: "●" },
    { legacyId: "RI_TORQUE_SETTINGS", label: "Torque settings", icon: "↻" },
    { legacyId: "RI_REPAIR_TIME", label: "Repair time", icon: "◷" },
    { legacyId: "RI_INSTRUCTIONS", label: "Instructions", icon: "≡" },
  ];

  function setMenu(open) {
    elements.body.classList.toggle("menu-open", open);
    elements.menuButton.setAttribute("aria-expanded", String(open));
    if (open) window.setTimeout(() => elements.manualSearch.focus(), 120);
  }

  function setReaderState(kind, title, message) {
    elements.reader.setAttribute("aria-busy", String(kind === "loading"));
    elements.procedureTabs.hidden = true;
    elements.readerState.hidden = false;
    elements.documentContent.hidden = true;
    elements.readerState.className = `reader-state ${kind === "error" ? "error" : ""}`;
    elements.readerState.innerHTML = "";

    const mark = document.createElement("span");
    mark.className = kind === "loading" ? "spinner" : "reader-mark";
    if (kind !== "loading") mark.textContent = kind === "error" ? "!" : "S";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    elements.readerState.append(mark, heading, paragraph);
  }

  function showDocument() {
    elements.reader.setAttribute("aria-busy", "false");
    elements.readerState.hidden = true;
    elements.documentContent.hidden = false;
  }

  function catalogUrl() {
    return new URL(elements.body.dataset.catalog || "./catalog.json", window.location.href);
  }

  function manualsBaseUrl() {
    return new URL(elements.body.dataset.manualsBase || "../manuals/", window.location.href);
  }

  function encodedPath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function sourceUrl(manual, page) {
    return new URL(`${encodeURIComponent(manual.folder)}/html/${encodedPath(page)}`, manualsBaseUrl());
  }

  function readerUrl(manual, page) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("manual", manual.folder);
    url.searchParams.set("page", page);
    return url;
  }

  function localPdfUrl(manual, section, embeddedPath) {
    const path = [manual.folder, section, ...embeddedPath.replaceAll("\\", "/").split("/").filter(Boolean)]
      .map(encodeURIComponent)
      .join("/");
    return new URL(`pdfs/${path}`, manualsBaseUrl());
  }

  function isValidPage(page) {
    return typeof page === "string" && pagePattern.test(page) && !page.includes("..");
  }

  function buildManualMaps(manual) {
    state.itemsById = new Map(manual.items.map((item) => [Number(item.id), item]));
    state.childrenByParent = new Map();
    const availableIds = new Set(state.itemsById.keys());

    for (const item of manual.items) {
      const parent = item.parentId !== null && availableIds.has(Number(item.parentId))
        ? String(item.parentId)
        : "root";
      const children = state.childrenByParent.get(parent) || [];
      children.push(item);
      state.childrenByParent.set(parent, children);
    }

    for (const children of state.childrenByParent.values()) {
      children.sort((left, right) => left.sort - right.sort || left.name.localeCompare(right.name, "en"));
    }
  }

  function ancestorsFor(item) {
    const ancestors = [];
    let cursor = item;
    const visited = new Set();
    while (cursor?.parentId !== null && !visited.has(cursor.parentId)) {
      visited.add(cursor.parentId);
      cursor = state.itemsById.get(Number(cursor.parentId));
      if (cursor) ancestors.unshift(cursor);
    }
    return ancestors;
  }

  function closestCatalogItem(page) {
    const exact = state.manual.items.find((item) => item.page === page);
    if (exact) return exact;

    const [section, filename = ""] = page.split("/");
    const candidates = state.manual.items
      .filter((item) => item.page?.startsWith(`${section}/`))
      .map((item) => ({ item, stem: item.page.slice(section.length + 1, -5) }))
      .filter(({ stem }) => filename.startsWith(stem))
      .sort((left, right) => right.stem.length - left.stem.length);
    return candidates[0]?.item || null;
  }

  function visibleItemIds(query) {
    if (!query) return null;
    const visible = new Set();
    for (const item of state.manual.items) {
      if (!item.name.toLowerCase().includes(query)) continue;
      visible.add(Number(item.id));
      for (const ancestor of ancestorsFor(item)) visible.add(Number(ancestor.id));
    }
    return visible;
  }

  function createTreeBranch(parentKey, visible, query) {
    const list = document.createElement("ul");
    const children = state.childrenByParent.get(parentKey) || [];

    for (const item of children) {
      if (visible && !visible.has(Number(item.id))) continue;
      const childItems = state.childrenByParent.get(String(item.id)) || [];
      const hasVisibleChildren = childItems.some((child) => !visible || visible.has(Number(child.id)));
      const entry = document.createElement("li");

      if (hasVisibleChildren) {
        const details = document.createElement("details");
        details.open = query ? true : item.parentId === null || item.depth <= 1;
        const summary = document.createElement("summary");
        summary.textContent = item.name;
        details.append(summary, createTreeBranch(String(item.id), visible, query));
        entry.append(details);
      } else if (item.page) {
        const link = document.createElement("a");
        link.className = "tree-link";
        if (item.page === state.currentPage) link.classList.add("active");
        link.href = readerUrl(state.manual, item.page).href;
        link.dataset.page = item.page;
        link.textContent = item.name;
        entry.append(link);
      } else {
        const label = document.createElement("span");
        label.className = "tree-label";
        label.textContent = item.name;
        entry.append(label);
      }

      list.append(entry);
    }
    return list;
  }

  function renderTree(query = "") {
    const normalized = query.trim().toLowerCase();
    const visible = visibleItemIds(normalized);
    elements.manualTree.innerHTML = "";
    const tree = createTreeBranch("root", visible, normalized);
    if (!tree.children.length) {
      const empty = document.createElement("p");
      empty.className = "tree-empty";
      empty.textContent = `No results for “${query.trim()}”.`;
      elements.manualTree.append(empty);
      return;
    }
    elements.manualTree.append(tree);
  }

  function renderManualOptions() {
    elements.manualSelect.innerHTML = "";
    for (const manual of state.catalog.manuals) {
      const option = document.createElement("option");
      option.value = manual.folder;
      option.textContent = `${manual.name} · ${manual.documentCount.toLocaleString("en-US")}`;
      elements.manualSelect.append(option);
    }
  }

  function activateManual(manual) {
    state.manual = manual;
    buildManualMaps(manual);
    elements.manualSelect.value = manual.folder;
    elements.documentCount.textContent = `${manual.documentCount.toLocaleString("en-US")} documents`;
    elements.topVehicle.textContent = manual.name;
    elements.manualSearch.value = "";
    renderTree();
  }

  function splitDocumentName(item, page) {
    const fallback = page.split("/").pop().replace(/\.html$/i, "");
    const name = item?.name || fallback;
    const match = name.match(/^([A-Z0-9-]{6,})\s+-\s+(.+)$/);
    return match ? { code: match[1], title: match[2] } : { code: null, title: name };
  }

  function renderHeader(page, item) {
    const parts = splitDocumentName(item, page);
    const section = page.split("/")[0];
    const ancestorNames = item ? ancestorsFor(item).map((ancestor) => ancestor.name) : [];
    const usefulAncestors = ancestorNames.filter((name) => !/^McLaren-SIS/i.test(name)).slice(-4);

    elements.documentTitle.textContent = parts.title;
    elements.documentSubtitle.textContent = usefulAncestors.length
      ? usefulAncestors.join(" · ")
      : `${state.manual.name} ${section.toLowerCase()} service information.`;
    elements.documentType.textContent = `${section} information`;
    elements.topDocument.textContent = parts.title;
    document.title = `${parts.title} · ${state.manual.name} · Supercar Docs`;

    elements.breadcrumbs.innerHTML = "";
    for (const name of [state.manual.name, ...usefulAncestors, parts.title]) {
      const crumb = document.createElement("span");
      crumb.textContent = name;
      elements.breadcrumbs.append(crumb);
    }

    elements.metadata.innerHTML = "";
    const labels = [state.manual.code, section, parts.code, "English"].filter(Boolean);
    for (const label of labels) {
      const chip = document.createElement("span");
      chip.textContent = label;
      elements.metadata.append(chip);
    }
  }

  function rewriteStyleUrls(style, baseUrl) {
    return style.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (match, quote, rawUrl) => {
      const value = rawUrl.trim();
      if (!value || value.startsWith("data:") || value.startsWith("#")) return match;
      try {
        return `url("${new URL(value, baseUrl).href}")`;
      } catch {
        return match;
      }
    });
  }

  function relativeManualPage(url) {
    const manualRoot = new URL(`${encodeURIComponent(state.manual.folder)}/html/`, manualsBaseUrl());
    if (url.origin !== manualRoot.origin || !url.pathname.startsWith(manualRoot.pathname)) return null;
    const relative = decodeURIComponent(url.pathname.slice(manualRoot.pathname.length));
    return isValidPage(relative) ? relative : null;
  }

  function renderProcedureTabs(sourceDocument, pageUrl) {
    const legacyToolbar = sourceDocument.querySelector("#RI");
    elements.procedureTabs.replaceChildren();
    if (!legacyToolbar) {
      elements.procedureTabs.hidden = true;
      return;
    }

    const sourceBase = sourceDocument.querySelector("base")?.getAttribute("href") || "./";
    const assetBase = new URL(sourceBase, pageUrl);

    for (const definition of procedureTabDefinitions) {
      const legacyControl = legacyToolbar.querySelector(`[id$="${definition.legacyId}"]`);
      if (!legacyControl) continue;

      const legacyId = legacyControl.id || "";
      const active = legacyId.startsWith("down");
      const explicitlyDisabled = legacyId.startsWith("dis") || legacyControl.tagName !== "A";
      let targetPage = active ? state.currentPage : null;

      if (!active && legacyControl.tagName === "A") {
        const href = legacyControl.getAttribute("href") || "";
        if (href && !/^javascript:/i.test(href)) {
          try { targetPage = relativeManualPage(new URL(href, assetBase)); } catch {}
        }
      }

      const available = active || (!explicitlyDisabled && targetPage);
      const tab = available && !active ? document.createElement("a") : document.createElement("span");
      tab.className = `procedure-tab${active ? " active" : ""}${available ? "" : " unavailable"}`;

      if (tab instanceof HTMLAnchorElement) {
        tab.href = readerUrl(state.manual, targetPage).href;
        tab.dataset.readerPage = targetPage;
      } else if (active) {
        tab.setAttribute("aria-current", "page");
      } else {
        tab.setAttribute("aria-disabled", "true");
        tab.title = "Not available in the recovered source";
      }

      const icon = document.createElement("span");
      icon.className = "procedure-tab__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = definition.icon;
      const label = document.createElement("span");
      label.textContent = definition.label;
      tab.append(icon, label);
      elements.procedureTabs.append(tab);
    }

    elements.procedureTabs.hidden = !elements.procedureTabs.childElementCount;
  }

  function sanitizeRecoveredContent(sourceDocument, pageUrl) {
    const sourceBase = sourceDocument.querySelector("base")?.getAttribute("href") || "./";
    const assetBase = new URL(sourceBase, pageUrl);
    const contentRoot = sourceDocument.querySelector("#SPLITSCREENdoccontent")
      || sourceDocument.querySelector('[id$="doccontent"]');
    const embeddedDocument = sourceDocument.querySelector("#SPLITSCREEN embed[src], embed[src]");
    const wrapper = document.createElement("div");

    if (!contentRoot && embeddedDocument) {
      const rawSource = embeddedDocument.getAttribute("src") || "";
      const legacyPdfMatch = rawSource.match(/^iframe\((.+?\.pdf)\)\.pdf(?:#.*)?$/i);
      const embeddedPath = legacyPdfMatch?.[1] || rawSource.replace(/#.*$/, "");
      const section = state.currentPage?.split("/")[0] || "Repair";
      const copiedPdfUrl = localPdfUrl(state.manual, section, embeddedPath);
      const card = document.createElement("section");
      card.className = "pdf-document";
      const icon = document.createElement("span");
      icon.className = "pdf-icon";
      icon.textContent = "PDF";
      const copy = document.createElement("div");
      const heading = document.createElement("h2");
      heading.textContent = "Technical PDF attachment";
      const message = document.createElement("p");
      message.textContent = "This original PDF has been copied into the modern manual package. Open it separately or use the embedded viewer below.";
      const link = document.createElement("a");
      link.className = "pdf-link";
      link.textContent = "Open PDF attachment";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.href = copiedPdfUrl.href;
      copy.append(heading, message, link);
      card.append(icon, copy);
      const viewer = document.createElement("iframe");
      viewer.className = "pdf-frame";
      viewer.src = `${copiedPdfUrl.href}#view=FitH&toolbar=1`;
      viewer.title = `PDF viewer - ${embeddedPath.split("/").pop()}`;
      wrapper.append(card, viewer);
      return wrapper;
    }

    const sourceRoot = contentRoot || sourceDocument.body;
    wrapper.innerHTML = sourceRoot?.innerHTML || "";
    wrapper.querySelectorAll("script, style, link, meta, base, iframe, object, embed, form").forEach((node) => node.remove());

    for (const node of wrapper.querySelectorAll("*")) {
      for (const attribute of [...node.attributes]) {
        if (eventAttributes.test(attribute.name)) node.removeAttribute(attribute.name);
      }

      const style = node.getAttribute("style");
      if (style?.includes("url(")) node.setAttribute("style", rewriteStyleUrls(style, assetBase));

      for (const attributeName of ["src", "poster", "background"]) {
        const value = node.getAttribute(attributeName);
        if (!value || value.startsWith("data:") || value.startsWith("#")) continue;
        try { node.setAttribute(attributeName, new URL(value, assetBase).href); } catch { node.removeAttribute(attributeName); }
      }

      const srcset = node.getAttribute("srcset");
      if (srcset) {
        const rewritten = srcset.split(",").map((candidate) => {
          const [url, descriptor] = candidate.trim().split(/\s+/, 2);
          try { return `${new URL(url, assetBase).href}${descriptor ? ` ${descriptor}` : ""}`; } catch { return ""; }
        }).filter(Boolean).join(", ");
        node.setAttribute("srcset", rewritten);
      }

      const href = node.getAttribute("href");
      if (href) {
        if (/^javascript:/i.test(href)) {
          node.removeAttribute("href");
        } else if (!href.startsWith("#")) {
          try {
            const resolved = new URL(href, assetBase);
            const internalPage = relativeManualPage(resolved);
            if (internalPage) {
              node.setAttribute("href", readerUrl(state.manual, internalPage).href);
              node.dataset.readerPage = internalPage;
            } else {
              node.setAttribute("href", resolved.href);
              if (resolved.origin !== window.location.origin) {
                node.setAttribute("target", "_blank");
                node.setAttribute("rel", "noopener noreferrer");
              }
            }
          } catch {
            node.removeAttribute("href");
          }
        }
      }
    }

    for (const table of wrapper.querySelectorAll("table")) {
      if (table.parentElement?.classList.contains("table-scroll")) continue;
      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      table.before(scroll);
      scroll.append(table);
    }

    if (!wrapper.textContent.trim() && !wrapper.querySelector("img")) {
      const empty = document.createElement("p");
      empty.className = "legacy-empty";
      empty.textContent = "This recovered document does not contain readable body content.";
      wrapper.append(empty);
    }

    return wrapper;
  }

  async function loadPage(page, options = {}) {
    if (!state.manual || !isValidPage(page)) {
      setReaderState("error", "Invalid document path", "Choose another document from the manual contents.");
      return;
    }

    state.currentRequest?.abort();
    state.currentRequest = new AbortController();
    state.currentPage = page;
    state.currentItem = closestCatalogItem(page);
    renderHeader(page, state.currentItem);
    renderTree(elements.manualSearch.value);
    setReaderState("loading", "Loading service information", `${state.manual.name} · ${page}`);
    elements.documentStatus.innerHTML = '<i class="status-dot"></i>Loading document';

    if (!options.fromHistory) {
      const url = readerUrl(state.manual, page);
      window.history[options.replace ? "replaceState" : "pushState"]({ manual: state.manual.folder, page }, "", url);
    }

    try {
      const pageUrl = sourceUrl(state.manual, page);
      const response = await fetch(pageUrl, { signal: state.currentRequest.signal, credentials: "same-origin" });
      if (!response.ok) throw new Error(`Document returned ${response.status}`);
      const html = await response.text();
      const sourceDocument = new DOMParser().parseFromString(html, "text/html");
      renderProcedureTabs(sourceDocument, pageUrl);
      const recoveredContent = sanitizeRecoveredContent(sourceDocument, pageUrl);

      elements.documentContent.replaceChildren(...recoveredContent.childNodes);
      showDocument();
      elements.documentStatus.innerHTML = `<i class="status-dot"></i>${page.split("/")[0]} document ready`;
      if (options.focus) elements.documentContent.focus({ preventScroll: true });
      if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: "instant" });
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error(error);
      setReaderState("error", "Document could not be opened", "The original manual page may be unavailable or the reader may not be running from the website server.");
      elements.documentStatus.innerHTML = '<i class="status-dot" style="background:#c73e32"></i>Document unavailable';
    }
  }

  function chooseManual(folder, requestedPage, options = {}) {
    const manual = state.catalog.manuals.find((candidate) => candidate.folder === folder) || state.catalog.manuals[0];
    activateManual(manual);
    const firstDocument = manual.items.find((item) => item.page)?.page;
    const page = isValidPage(requestedPage) ? requestedPage : firstDocument;
    if (page) loadPage(page, options);
  }

  function setupTheme() {
    let savedTheme = null;
    let savedScale = 1;
    try {
      savedTheme = localStorage.getItem("kks-reader-theme");
      savedScale = Number(localStorage.getItem("kks-reader-scale") || 1);
    } catch {}

    const theme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : "light";
    document.documentElement.dataset.theme = theme;
    if (savedScale >= .8 && savedScale <= 1.4) state.textScale = savedScale;
    applyTextScale();
  }

  function changeTheme() {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    elements.themeButton.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    try { localStorage.setItem("kks-reader-theme", theme); } catch {}
  }

  function changeTextScale(change) {
    state.textScale = Math.max(.8, Math.min(1.4, Math.round((state.textScale + change) * 10) / 10));
    applyTextScale();
    try { localStorage.setItem("kks-reader-scale", state.textScale); } catch {}
  }

  function applyTextScale() {
    document.documentElement.style.setProperty("--document-scale", state.textScale);
    elements.textScaleValue.textContent = `${Math.round(state.textScale * 100)}%`;
  }

  function bindEvents() {
    elements.menuButton.addEventListener("click", () => setMenu(!elements.body.classList.contains("menu-open")));
    elements.mobileContents.addEventListener("click", () => setMenu(true));
    elements.backdrop.addEventListener("click", () => setMenu(false));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") setMenu(false); });
    elements.mobileTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    elements.themeButton.addEventListener("click", changeTheme);
    elements.printButtons.forEach((button) => button.addEventListener("click", () => window.print()));
    elements.increaseText.addEventListener("click", () => changeTextScale(.1));
    elements.decreaseText.addEventListener("click", () => changeTextScale(-.1));

    elements.manualSelect.addEventListener("change", () => {
      const manual = state.catalog.manuals.find((candidate) => candidate.folder === elements.manualSelect.value);
      chooseManual(manual.folder, null);
    });

    elements.manualSearch.addEventListener("input", () => renderTree(elements.manualSearch.value));

    elements.manualTree.addEventListener("click", (event) => {
      const link = event.target.closest("[data-page]");
      if (!link) return;
      event.preventDefault();
      loadPage(link.dataset.page, { focus: true });
      if (window.innerWidth <= 780) setMenu(false);
    });

    elements.documentContent.addEventListener("click", (event) => {
      const link = event.target.closest("[data-reader-page]");
      if (!link) return;
      event.preventDefault();
      loadPage(link.dataset.readerPage, { focus: true });
    });

    elements.procedureTabs.addEventListener("click", (event) => {
      const link = event.target.closest("[data-reader-page]");
      if (!link) return;
      event.preventDefault();
      loadPage(link.dataset.readerPage, { focus: true });
    });

    window.addEventListener("popstate", () => {
      const params = new URLSearchParams(window.location.search);
      const folder = params.get("manual");
      const page = params.get("page");
      if (folder !== state.manual?.folder) chooseManual(folder, page, { fromHistory: true });
      else if (isValidPage(page)) loadPage(page, { fromHistory: true, preserveScroll: false });
    });
  }

  async function initialize() {
    setupTheme();
    bindEvents();
    try {
      const response = await fetch(catalogUrl(), { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Catalog returned ${response.status}`);
      state.catalog = await response.json();
      if (!Array.isArray(state.catalog.manuals) || !state.catalog.manuals.length) throw new Error("Catalog is empty");
      renderManualOptions();

      const params = new URLSearchParams(window.location.search);
      const requestedManual = params.get("manual");
      const requestedPage = params.get("page");
      const preferred = state.catalog.manuals.find((manual) => manual.folder === requestedManual)
        || state.catalog.manuals.find((manual) => manual.folder === "McLaren-SIS-750S-Coupe")
        || state.catalog.manuals[0];
      chooseManual(preferred.folder, requestedPage, { replace: true });
    } catch (error) {
      console.error(error);
      elements.manualTree.innerHTML = '<p class="tree-empty">The manual index could not be loaded.</p>';
      setReaderState("error", "Manual library unavailable", "Run this reader from the same website that contains the manuals and catalog.");
    }
  }

  initialize();
})();
