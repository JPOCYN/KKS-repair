const vehicleSearch = document.querySelector("[data-vehicle-search]");

const authPortal = document.querySelector("[data-auth-portal]");
if (authPortal instanceof HTMLElement) {
  const tabs = [...authPortal.querySelectorAll("[data-auth-tab]")];
  const panels = [...authPortal.querySelectorAll('[role="tabpanel"]')];

  const selectAuthTab = (name, updateHash = false) => {
    if (name !== "signin" && name !== "register") return;
    for (const tab of tabs) {
      const active = tab.getAttribute("data-auth-tab") === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("tabindex", active ? "0" : "-1");
    }
    for (const panel of panels) panel.toggleAttribute("hidden", panel.id !== name);
    if (updateHash) history.replaceState(null, "", name === "register" ? "#register" : "#signin");
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => selectAuthTab(tab.getAttribute("data-auth-tab") || "signin", true));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const nextTab = event.key === "ArrowRight" ? (tab.nextElementSibling || tabs[0]) : (tab.previousElementSibling || tabs[tabs.length - 1]);
      if (!(nextTab instanceof HTMLElement)) return;
      selectAuthTab(nextTab.getAttribute("data-auth-tab") || "signin", true);
      nextTab.focus();
    });
  }
  const initialTab = location.hash === "#register" ? "register" : authPortal.getAttribute("data-default-auth-tab") || "signin";
  selectAuthTab(initialTab);
}

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

function initializeAdminFilter({ rowSelector, filterSelector, filterAttribute, searchSelector, stateAttribute, countSelector, emptySelector, initialState = "" }) {
  const rows = [...document.querySelectorAll(rowSelector)];
  if (!rows.length) return;
  const filters = [...document.querySelectorAll(filterSelector)];
  const search = document.querySelector(searchSelector);
  const count = document.querySelector(countSelector);
  const empty = document.querySelector(emptySelector);
  let selectedState = initialState;

  const apply = () => {
    const query = search instanceof HTMLInputElement ? search.value.trim().toLowerCase() : "";
    let visible = 0;
    for (const row of rows) {
      const matchesState = !selectedState || row.getAttribute(stateAttribute) === selectedState;
      const matchesSearch = !query || (row.getAttribute("data-search") || "").includes(query);
      const matches = matchesState && matchesSearch;
      row.toggleAttribute("hidden", !matches);
      if (matches) visible += 1;
    }
    if (count) count.textContent = String(visible);
    if (empty) empty.toggleAttribute("hidden", visible !== 0);
  };

  if (search instanceof HTMLInputElement) search.addEventListener("input", apply);
  for (const filter of filters) {
    filter.addEventListener("click", () => {
      selectedState = filter.getAttribute(filterAttribute) || "";
      for (const candidate of filters) {
        const active = candidate === filter;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-pressed", String(active));
      }
      apply();
    });
  }
  apply();
}

initializeAdminFilter({
  rowSelector: "[data-member-admin-row]",
  filterSelector: "[data-member-filter]",
  filterAttribute: "data-member-filter",
  searchSelector: "[data-member-admin-search]",
  stateAttribute: "data-member-state",
  countSelector: "[data-member-result-count]",
  emptySelector: "[data-member-empty]",
});

initializeAdminFilter({
  rowSelector: "[data-code-admin-row]",
  filterSelector: "[data-code-filter]",
  filterAttribute: "data-code-filter",
  searchSelector: "[data-code-admin-search]",
  stateAttribute: "data-code-state",
  countSelector: "[data-code-result-count]",
  emptySelector: "[data-code-empty]",
  initialState: "available",
});

function formatConvertedValue(value) {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toPrecision(10)));
}

for (const converter of document.querySelectorAll("[data-converter]")) {
  const inputA = converter.querySelector("[data-converter-a]");
  const inputB = converter.querySelector("[data-converter-b]");
  const clear = converter.querySelector("[data-converter-clear]");
  const factor = Number(converter.getAttribute("data-factor"));
  if (!(inputA instanceof HTMLInputElement) || !(inputB instanceof HTMLInputElement) || !Number.isFinite(factor) || factor === 0) continue;
  inputA.addEventListener("input", () => { inputB.value = inputA.value === "" ? "" : formatConvertedValue(Number(inputA.value) * factor); });
  inputB.addEventListener("input", () => { inputA.value = inputB.value === "" ? "" : formatConvertedValue(Number(inputB.value) / factor); });
  clear?.addEventListener("click", () => { inputA.value = ""; inputB.value = ""; inputA.focus(); });
}

for (const converter of document.querySelectorAll("[data-temperature-converter]")) {
  const celsius = converter.querySelector("[data-temperature-c]");
  const fahrenheit = converter.querySelector("[data-temperature-f]");
  const clear = converter.querySelector("[data-temperature-clear]");
  if (!(celsius instanceof HTMLInputElement) || !(fahrenheit instanceof HTMLInputElement)) continue;
  celsius.addEventListener("input", () => { fahrenheit.value = celsius.value === "" ? "" : formatConvertedValue((Number(celsius.value) * 9) / 5 + 32); });
  fahrenheit.addEventListener("input", () => { celsius.value = fahrenheit.value === "" ? "" : formatConvertedValue(((Number(fahrenheit.value) - 32) * 5) / 9); });
  clear?.addEventListener("click", () => { celsius.value = ""; fahrenheit.value = ""; celsius.focus(); });
}

for (const finder of document.querySelectorAll("[data-manual-finder]")) {
  const brandSelect = finder.querySelector("[data-finder-brand]");
  const modelSelect = finder.querySelector("[data-finder-model]");
  const yearSelect = finder.querySelector("[data-finder-year]");
  const systemSelect = finder.querySelector("[data-finder-system]");
  const taskSelect = finder.querySelector("[data-finder-task]");
  const result = finder.querySelector("[data-finder-result]");
  const status = finder.querySelector("[data-finder-status]");
  const title = finder.querySelector("[data-finder-title]");
  const summary = finder.querySelector("p[data-finder-copy]");
  const checklist = finder.querySelector("[data-finder-checklist]");
  const copyButton = finder.querySelector("button[data-finder-copy]");
  const printButton = finder.querySelector("[data-finder-print]");
  const copyStatus = finder.querySelector("[data-finder-copy-status]");
  const action = finder.querySelector("[data-finder-action]");
  if (!(brandSelect instanceof HTMLSelectElement) || !(modelSelect instanceof HTMLSelectElement) || !(yearSelect instanceof HTMLSelectElement) || !(systemSelect instanceof HTMLSelectElement) || !(taskSelect instanceof HTMLSelectElement) || !(result instanceof HTMLElement) || !(checklist instanceof HTMLOListElement) || !(action instanceof HTMLAnchorElement)) continue;

  const brandNames = { mclaren: "McLaren", ferrari: "Ferrari", lamborghini: "Lamborghini" };
  const systemNames = {
    brakes: "brake system",
    electrical: "electrical and diagnostic",
    suspension: "suspension and steering",
    powertrain: "engine and transmission",
    cooling: "cooling system",
    hvac: "air-conditioning",
    body: "body, door, and interior",
    adas: "driver-assistance and calibration",
  };
  const taskNames = {
    "remove-replace": "component removal or replacement",
    diagnose: "fault diagnosis",
    "inspect-service": "inspection or service",
    "setup-calibrate": "setup or calibration",
  };
  const systemItems = {
    brakes: ["Brake system description, warnings, and isolation information", "Bleeding, parking-brake service mode, or calibration information when applicable"],
    electrical: ["System description, power supply, grounds, and network overview", "Wiring diagrams, connector views, pin information, and approved test points"],
    suspension: ["Vehicle lifting, support, ride-height, and suspension depressurisation information when applicable", "Wheel-alignment, ride-height, or steering-angle setup information after work"],
    powertrain: ["Powertrain safety, fluid handling, and isolation information", "Related cooling, lubrication, exhaust, electrical, and control-system documents"],
    cooling: ["Cooling circuit description, pressure warnings, and drain/fill information", "Bleeding, vacuum-fill, leak-check, and post-repair temperature verification information"],
    hvac: ["Refrigerant safety, recovery, evacuation, and leak-test information", "Current refrigerant, oil, charge, and component-balance information from the vehicle-specific source"],
    body: ["SRS, battery, glazing, latch, and powered-movement isolation information when applicable", "Alignment, sealing, adhesive, corrosion-protection, and trim-fastener information"],
    adas: ["Sensor, camera, radar, control-unit, and network system description", "Calibration prerequisites, target or tool requirements, setup environment, and completion checks"],
  };
  const taskItems = {
    "remove-replace": ["Component removal and installation procedure with prerequisites", "Fastener torque references, tightening sequence, and one-time-use hardware notes", "Approved consumables, fluids, seals, and replacement-part notes from the current source"],
    diagnose: ["Symptom chart, diagnostic trouble-code information, and test sequence", "Expected scan-tool functions, live-data references, and test-equipment requirements", "Known prerequisites and checks that prevent replacing a component before the fault is proven"],
    "inspect-service": ["Inspection procedure, measurement method, and acceptance criteria from the current source", "Maintenance interval, consumables, and reset procedure when applicable", "Wear, leak, damage, and related-system checks to record on the job card"],
    "setup-calibrate": ["Setup or calibration procedure and all prerequisites", "Required tools, software, targets, environmental conditions, and vehicle loading state", "Completion criteria, stored-fault check, and post-calibration road or functional test when required"],
  };
  let currentChecklist = [];

  const updateFinder = () => {
    const brand = brandSelect.value;
    const brandName = brandNames[brand] || "Selected marque";
    const available = brand === "mclaren";
    const options = [...modelSelect.options];
    for (const option of options) {
      const matches = option.getAttribute("data-brand") === brand;
      option.hidden = !matches;
      option.disabled = !matches;
    }
    if (modelSelect.selectedOptions[0]?.disabled) {
      const firstMatch = options.find((option) => !option.disabled);
      if (firstMatch) firstMatch.selected = true;
    }
    const model = modelSelect.value;
    const year = yearSelect.value;
    const systemName = systemNames[systemSelect.value] || "selected system";
    const taskName = taskNames[taskSelect.value] || "workshop job";
    currentChecklist = [
      `Vehicle identity and document applicability: VIN, ${year === "Confirm from VIN" ? "model year" : year}, market, body style, and fitted options`,
      "Current workshop safety information, required personal protection, and vehicle isolation steps",
      ...(systemItems[systemSelect.value] || []),
      ...(taskItems[taskSelect.value] || []),
      "Related technical bulletins, supersessions, and adjacent procedures referenced by the main document",
      "Post-work inspection, diagnostic fault check, and functional verification",
    ];
    checklist.replaceChildren(...currentChecklist.map((item) => {
      const element = document.createElement("li");
      element.textContent = item;
      return element;
    }));
    result.classList.toggle("is-available", available);
    if (status) status.textContent = available ? "McLaren member catalogue available" : `${brandName} member catalogue planned`;
    if (title) title.textContent = `${brandName}${available ? ` ${model}` : ""} ${systemName} ${taskName} document checklist`;
    if (summary) summary.textContent = `Gather and verify each item against the exact VIN, ${year === "Confirm from VIN" ? "model year" : year}, market, and fitted equipment before work begins.`;
    action.href = available ? finder.getAttribute("data-member-url") || "/login" : "/guides";
    action.textContent = `${available ? "Locate documents in member library" : "Browse free workshop guides"} →`;
    if (copyStatus) copyStatus.textContent = "";
  };

  brandSelect.addEventListener("change", updateFinder);
  modelSelect.addEventListener("change", updateFinder);
  yearSelect.addEventListener("change", updateFinder);
  systemSelect.addEventListener("change", updateFinder);
  taskSelect.addEventListener("change", updateFinder);
  copyButton?.addEventListener("click", async () => {
    const text = `${title?.textContent || "Repair document checklist"}\n\n${currentChecklist.map((item) => `☐ ${item}`).join("\n")}\n\nGenerated with Supercar Docs — verify all information against the exact vehicle and current service source.`;
    try {
      await navigator.clipboard.writeText(text);
      if (copyStatus) copyStatus.textContent = "Copied";
    } catch {
      if (copyStatus) copyStatus.textContent = "Copy unavailable—select and copy the list manually";
    }
  });
  printButton?.addEventListener("click", () => window.print());
  updateFinder();
}
