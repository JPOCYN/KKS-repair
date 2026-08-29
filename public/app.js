const vehicleSearch = document.querySelector("[data-vehicle-search]");
const vehicleCards = [...document.querySelectorAll("[data-vehicle-card]")];
if (vehicleCards.length) {
  const resultCount = document.querySelector("[data-result-count]");
  const emptyResults = document.querySelector("[data-empty-results]");
  const brandFilters = [...document.querySelectorAll("[data-brand-filter]")];
  let selectedBrand = "";

  const applyVehicleFilters = () => {
    const query = vehicleSearch instanceof HTMLInputElement ? vehicleSearch.value.trim().toLowerCase() : "";
    let visible = 0;
    for (const card of vehicleCards) {
      const matchesSearch = !query || (card.getAttribute("data-search") || "").includes(query);
      const matchesBrand = !selectedBrand || card.getAttribute("data-brand") === selectedBrand;
      const match = matchesSearch && matchesBrand;
      card.toggleAttribute("hidden", !match);
      if (match) visible += 1;
    }
    if (resultCount) resultCount.textContent = String(visible);
    if (emptyResults) emptyResults.toggleAttribute("hidden", visible !== 0);
  };

  if (vehicleSearch instanceof HTMLInputElement) vehicleSearch.addEventListener("input", applyVehicleFilters);
  for (const filter of brandFilters) {
    filter.addEventListener("click", () => {
      selectedBrand = filter.getAttribute("data-brand-filter") || "";
      for (const candidate of brandFilters) {
        const active = candidate === filter;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      }
      applyVehicleFilters();
    });
  }
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

const durationInput = document.querySelector("[data-duration-input]");
if (durationInput instanceof HTMLInputElement) {
  for (const button of document.querySelectorAll("[data-duration-value]")) {
    button.addEventListener("click", () => {
      durationInput.value = button.getAttribute("data-duration-value") || durationInput.value;
      durationInput.focus();
    });
  }
}
