const vehicleSearch = document.querySelector("[data-vehicle-search]");
if (vehicleSearch instanceof HTMLInputElement) {
  const cards = [...document.querySelectorAll("[data-vehicle-card]")];
  const resultCount = document.querySelector("[data-result-count]");
  const emptyResults = document.querySelector("[data-empty-results]");
  vehicleSearch.addEventListener("input", () => {
    const query = vehicleSearch.value.trim().toLowerCase();
    let visible = 0;
    for (const card of cards) {
      const match = !query || (card.getAttribute("data-search") || "").includes(query);
      card.toggleAttribute("hidden", !match);
      if (match) visible += 1;
    }
    if (resultCount) resultCount.textContent = String(visible);
    if (emptyResults) emptyResults.toggleAttribute("hidden", visible !== 0);
  });
}

const manualSearch = document.querySelector("[data-manual-search]");
if (manualSearch instanceof HTMLInputElement) {
  const items = [...document.querySelectorAll(".manual-tree li")];
  const links = [...document.querySelectorAll("[data-manual-link]")];
  manualSearch.addEventListener("input", () => {
    const query = manualSearch.value.trim().toLowerCase();
    for (const item of items) {
      item.toggleAttribute("hidden", Boolean(query) && !item.textContent?.toLowerCase().includes(query));
    }
    if (query) {
      for (const details of document.querySelectorAll(".manual-tree details")) details.open = true;
    }
  });
  for (const link of links) {
    link.addEventListener("click", () => {
      for (const candidate of links) candidate.classList.toggle("is-active", candidate === link);
    });
  }
}
