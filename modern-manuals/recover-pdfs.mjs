import https from "node:https";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(outputDirectory, "..");
const manualsRoot = join(workspace, "manuals");
const outputRoot = join(outputDirectory, "pdfs");
const manifestFile = join(outputDirectory, "pdf-manifest.json");
const catalog = JSON.parse(readFileSync(join(outputDirectory, "catalog.json"), "utf8"));
const concurrency = Math.max(1, Math.min(32, Number(process.argv.find((value) => value.startsWith("--concurrency="))?.split("=")[1] || 8)));
const limit = Math.max(0, Number(process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1] || 0));
const dryRun = process.argv.includes("--dry-run");
const agent = new https.Agent({ keepAlive: true, maxSockets: concurrency, rejectUnauthorized: false });
const tasks = [];
const seen = new Set();

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

function safeParts(path) {
  const parts = path.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.length && parts.every((part) => part !== "." && part !== ".." && !part.includes("\0")) ? parts : null;
}

for (const manual of catalog.manuals) {
  const htmlRoot = join(manualsRoot, manual.folder, "html");
  for (const htmlFile of allHtmlFiles(htmlRoot)) {
    const section = relative(htmlRoot, htmlFile).split(sep)[0];
    if (!['Repair', 'System', 'Wiring'].includes(section)) continue;
    const html = readFileSync(htmlFile, "utf8");
    for (const match of html.matchAll(/\bsrc\s*=\s*["']iframe\(([^)"']+\.pdf)\)\.pdf(?:#[^"']*)?["']/gi)) {
      const embeddedPath = match[1].replaceAll("\\", "/");
      const parts = safeParts(embeddedPath);
      if (!parts) continue;
      const key = `${manual.folder}|${section}|${embeddedPath.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const remotePath = parts.map(encodeURIComponent).join("/");
      const remoteUrl = `https://kks-repair.com/${encodeURIComponent(manual.folder)}/html/${encodeURIComponent(section)}/sources/iframe(${remotePath}).pdf`;
      const destination = resolve(outputRoot, manual.folder, section, ...parts);
      const allowedRoot = resolve(outputRoot) + sep;
      if (!destination.startsWith(allowedRoot)) continue;
      tasks.push({
        manual: manual.folder,
        section,
        embeddedPath,
        filename: basename(embeddedPath),
        remoteUrl,
        destination,
        readerPath: `./pdfs/${[manual.folder, section, ...parts].map(encodeURIComponent).join("/")}`,
      });
    }
  }
}

tasks.sort((left, right) => left.manual.localeCompare(right.manual, "en") || left.section.localeCompare(right.section, "en") || left.embeddedPath.localeCompare(right.embeddedPath, "en"));
const selectedTasks = limit ? tasks.slice(0, limit) : tasks;

if (dryRun) {
  const byManual = Object.fromEntries(catalog.manuals.map((manual) => [manual.folder, tasks.filter((task) => task.manual === manual.folder).length]));
  const unavailableLocally = tasks.filter((task) => !isPdfFile(task.destination));
  console.log(JSON.stringify({
    uniquePdfFiles: tasks.length,
    selected: selectedTasks.length,
    availableLocally: tasks.length - unavailableLocally.length,
    unavailableLocally: unavailableLocally.length,
    missingFiles: unavailableLocally.map((task) => ({ manual: task.manual, section: task.section, embeddedPath: task.embeddedPath, remoteUrl: task.remoteUrl })),
    byManual,
  }, null, 2));
  agent.destroy();
  process.exit(0);
}

function isPdfFile(path) {
  if (!existsSync(path) || statSync(path).size < 8) return false;
  const handle = openSync(path, "r");
  const signature = Buffer.alloc(5);
  try {
    readSync(handle, signature, 0, signature.length, 0);
  } finally {
    closeSync(handle);
  }
  return signature.toString("ascii") === "%PDF-";
}

function download(task) {
  return new Promise((resolvePromise) => {
    if (isPdfFile(task.destination)) {
      resolvePromise({ ...task, status: "reused", bytes: statSync(task.destination).size });
      return;
    }

    const request = https.get(task.remoteUrl, {
      agent,
      headers: { "User-Agent": "KKS-Repair-PDF-Recovery/1.0", Accept: "application/pdf,*/*;q=0.8" },
      timeout: 60_000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        const valid = response.statusCode === 200 && body.length >= 8 && body.subarray(0, 5).toString("ascii") === "%PDF-";
        if (!valid) {
          resolvePromise({ ...task, status: response.statusCode === 404 ? "missing" : "invalid", bytes: body.length, httpStatus: response.statusCode || 0 });
          return;
        }
        mkdirSync(dirname(task.destination), { recursive: true });
        const temporary = `${task.destination}.part`;
        writeFileSync(temporary, body);
        renameSync(temporary, task.destination);
        resolvePromise({ ...task, status: "downloaded", bytes: body.length });
      });
      response.on("error", (error) => resolvePromise({ ...task, status: "failed", bytes: 0, error: error.message }));
    });
    request.on("timeout", () => request.destroy(new Error("Request timed out")));
    request.on("error", (error) => {
      const temporary = `${task.destination}.part`;
      if (existsSync(temporary)) unlinkSync(temporary);
      resolvePromise({ ...task, status: "failed", bytes: 0, error: error.message });
    });
  });
}

let cursor = 0;
let completed = 0;
const results = [];

async function worker() {
  while (cursor < selectedTasks.length) {
    const task = selectedTasks[cursor++];
    const result = await download(task);
    results.push(result);
    completed += 1;
    if (completed % 25 === 0 || completed === selectedTasks.length) {
      const successful = results.filter((entry) => entry.status === "downloaded" || entry.status === "reused").length;
      const bytes = results.filter((entry) => entry.status === "downloaded" || entry.status === "reused").reduce((sum, entry) => sum + entry.bytes, 0);
      console.log(JSON.stringify({ completed, total: selectedTasks.length, successful, megabytes: Number((bytes / 1024 ** 2).toFixed(1)) }));
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
agent.destroy();

const available = results
  .filter((entry) => entry.status === "downloaded" || entry.status === "reused")
  .map((entry) => ({
    manual: entry.manual,
    section: entry.section,
    embeddedPath: entry.embeddedPath,
    path: entry.readerPath,
    bytes: entry.bytes,
  }));
const failures = results
  .filter((entry) => entry.status !== "downloaded" && entry.status !== "reused")
  .map((entry) => ({ manual: entry.manual, section: entry.section, embeddedPath: entry.embeddedPath, status: entry.status, httpStatus: entry.httpStatus || null, error: entry.error || null }));
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  referenced: selectedTasks.length,
  available: available.length,
  missing: failures.length,
  totalBytes: available.reduce((sum, entry) => sum + entry.bytes, 0),
  files: available,
  failures,
};

writeFileSync(manifestFile, `${JSON.stringify(manifest)}\n`);
console.log(JSON.stringify({ referenced: manifest.referenced, available: manifest.available, missing: manifest.missing, totalMegabytes: Number((manifest.totalBytes / 1024 ** 2).toFixed(1)), manifest: manifestFile }, null, 2));
if (failures.length) process.exitCode = 2;
