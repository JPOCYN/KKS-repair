import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(directory, "..");
const catalog = JSON.parse(readFileSync(join(directory, "catalog.json"), "utf8"));
const requiredReaderFiles = [
  "index.html",
  "reader.css",
  "reader.js",
  "catalog.json",
  "build-catalog.mjs",
  "pdf-manifest.json",
  "recover-pdfs.mjs",
  "validate-pdfs.py",
];
const failures = [];
const pdfManifest = JSON.parse(readFileSync(join(directory, "pdf-manifest.json"), "utf8"));
const sectionCounts = { Repair: 0, System: 0, Wiring: 0 };
let documents = 0;
let contentRoots = 0;
let embeddedDocuments = 0;
let rawHtmlPages = 0;
let rawContentPages = 0;
let rawEmbeddedPages = 0;
let rawFallbackPages = 0;

function allHtmlFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) files.push(fullPath);
    }
  }
  return files;
}

for (const filename of requiredReaderFiles) {
  if (!existsSync(join(directory, filename))) failures.push(`Missing reader file: ${filename}`);
}

if (pdfManifest.referenced !== 1434 || pdfManifest.available !== 1434 || pdfManifest.missing !== 0) {
  failures.push(
    `PDF manifest mismatch: ${pdfManifest.available}/${pdfManifest.referenced} available, ${pdfManifest.missing} missing`,
  );
}

for (const pdf of pdfManifest.files) {
  const pdfFile = join(directory, ...pdf.path.replace(/^\.\//, "").split("/"));
  if (!existsSync(pdfFile)) failures.push(`Missing recovered PDF: ${pdf.path}`);
}

if (catalog.manuals.length !== 16) failures.push(`Expected 16 manuals; found ${catalog.manuals.length}`);
if (new Set(catalog.manuals.map((manual) => manual.folder)).size !== catalog.manuals.length) {
  failures.push("Catalog contains duplicate manual folders");
}

for (const manual of catalog.manuals) {
  let manualDocuments = 0;
  for (const item of manual.items) {
    if (!item.page) continue;
    documents += 1;
    manualDocuments += 1;

    if (!/^(Repair|System|Wiring)\/[A-Za-z0-9._-]+\.html$/.test(item.page)) {
      failures.push(`Unsafe page path: ${manual.folder}/${item.page}`);
      continue;
    }

    const section = item.page.split("/")[0];
    sectionCounts[section] += 1;
    const sourceFile = join(workspace, "manuals", manual.folder, "html", ...item.page.split("/"));
    if (!existsSync(sourceFile)) {
      failures.push(`Missing source document: ${manual.folder}/${item.page}`);
      continue;
    }

    const html = readFileSync(sourceFile, "utf8");
    if (/id=["'][A-Za-z0-9_-]*doccontent["']/i.test(html)) contentRoots += 1;
    else if (/<embed\b[^>]*\bsrc=["'][^"']+/i.test(html)) embeddedDocuments += 1;
    else failures.push(`No readable content or embedded attachment: ${manual.folder}/${item.page}`);
  }

  if (manualDocuments !== manual.documentCount) {
    failures.push(`${manual.folder} count mismatch: ${manual.documentCount} catalog / ${manualDocuments} indexed`);
  }

  const htmlRoot = join(workspace, "manuals", manual.folder, "html");
  for (const sourceFile of allHtmlFiles(htmlRoot)) {
    rawHtmlPages += 1;
    const html = readFileSync(sourceFile, "utf8");
    if (/id=["'][A-Za-z0-9_-]*doccontent["']/i.test(html)) rawContentPages += 1;
    else if (/<embed\b[^>]*\bsrc=["'][^"']+/i.test(html)) rawEmbeddedPages += 1;
    else rawFallbackPages += 1;
  }
}

const result = {
  status: failures.length ? "failed" : "passed",
  manuals: catalog.manuals.length,
  documents,
  readableContentRoots: contentRoots,
  embeddedDocuments,
  recoveredPdfs: {
    referenced: pdfManifest.referenced,
    available: pdfManifest.available,
    missing: pdfManifest.missing,
    totalBytes: pdfManifest.totalBytes,
  },
  sections: sectionCounts,
  rawPages: {
    total: rawHtmlPages,
    readableContent: rawContentPages,
    embeddedAttachments: rawEmbeddedPages,
    bodyFallback: rawFallbackPages,
  },
  failures: failures.slice(0, 25),
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
