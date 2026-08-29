import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(outputDirectory, "..");
const cars = JSON.parse(readFileSync(join(workspace, "recovery", "catalog", "cars.json"), "utf8"));
const recovered = JSON.parse(readFileSync(join(workspace, "recovery", "catalog", "manual-menus.json"), "utf8"));
const carsById = new Map(cars.map((car) => [Number(car.id), car]));
const nonEnglishScripts = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
const nonEnglishDocumentLabel = /(?:japanese|arabic|french|german|spanish|italian|chinese|korean|portuguese|russian|\s-\s(?:ja|jp|de|fr|es|it|zh|ko|pt|ru)(?:\s-|\s|$))/i;

function isNonEnglishLabel(value) {
  const label = String(value || "");
  return nonEnglishScripts.test(label) || nonEnglishDocumentLabel.test(label);
}

function relativeFile(item, itemsById) {
  if (!item.flag || item.depth < 2 || /customer service/i.test(item.name)) return null;
  let section = item;
  while (section.depth > 1 && section.parentSourceId !== null) {
    section = itemsById.get(section.parentSourceId);
    if (!section) return null;
  }

  const sectionName = section.name.toLowerCase();
  const directory = sectionName.includes("repair")
    ? "Repair"
    : sectionName.includes("system")
      ? "System"
      : sectionName.includes("wiring")
        ? "Wiring"
        : null;

  return directory ? `${directory}/${item.menuId}.html` : null;
}

function englishItems(items) {
  const hidden = new Set(
    items
      .filter((item) => isNonEnglishLabel(item.name))
      .map((item) => Number(item.sourceId)),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentSourceId !== null && hidden.has(Number(item.parentSourceId)) && !hidden.has(Number(item.sourceId))) {
        hidden.add(Number(item.sourceId));
        changed = true;
      }
    }
  }

  return items.filter((item) => !hidden.has(Number(item.sourceId)));
}

const manuals = [];
let totalDocuments = 0;
let totalItems = 0;
let missingDocuments = 0;

for (const recoveredManual of recovered.manuals) {
  const car = carsById.get(Number(recoveredManual.carId));
  if (!car?.folderName) continue;

  const sourceItems = englishItems(recoveredManual.items);
  const itemsById = new Map(sourceItems.map((item) => [Number(item.sourceId), item]));
  const items = sourceItems.map((item) => {
    const page = relativeFile(item, itemsById);
    const pageExists = page
      ? existsSync(join(workspace, "manuals", car.folderName, "html", ...page.split("/")))
      : false;

    if (page && !pageExists) missingDocuments += 1;
    if (pageExists) totalDocuments += 1;

    return {
      id: Number(item.sourceId),
      parentId: item.parentSourceId === null ? null : Number(item.parentSourceId),
      name: String(item.name || "Untitled section").trim(),
      page: pageExists ? page : null,
      depth: Number(item.depth || 0),
      sort: Number(item.sort || 0),
    };
  });

  totalItems += items.length;
  manuals.push({
    id: Number(recoveredManual.carId),
    manualId: Number(recoveredManual.manualId),
    folder: car.folderName,
    name: car.carName || car.carNum || car.folderName,
    code: car.carNum || car.carName || car.folderName,
    documentCount: items.filter((item) => item.page).length,
    items,
  });
}

manuals.sort((left, right) => String(left.name).localeCompare(String(right.name), "en"));

const catalog = {
  version: 1,
  generatedAt: new Date().toISOString(),
  manuals,
};

writeFileSync(join(outputDirectory, "catalog.json"), `${JSON.stringify(catalog)}\n`);

console.log(JSON.stringify({
  manuals: manuals.length,
  items: totalItems,
  documents: totalDocuments,
  missingDocuments,
  output: join(outputDirectory, "catalog.json"),
}, null, 2));
