import https from "node:https";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";

const currentDirectory = resolve(".");
const workspace = existsSync(join(currentDirectory, "recovery/catalog/cars.json"))
  ? currentDirectory
  : resolve("outputs/kks-repair-rebuild");
const manualsRoot = join(workspace, "manuals");
const catalog = JSON.parse(readFileSync(join(workspace, "recovery/catalog/cars.json"), "utf8"));
const recovered = JSON.parse(readFileSync(join(workspace, "recovery/catalog/manual-menus.json"), "utf8"));
const reportFile = join(workspace, "recovery/manual-asset-report.json");
const concurrency = Math.max(1, Math.min(64, Number(process.argv.find((value) => value.startsWith("--concurrency="))?.split("=")[1] ?? 20)));
const maxBytes = Math.max(1, Number(process.argv.find((value) => value.startsWith("--max-gb="))?.split("=")[1] ?? 24)) * 1024 ** 3;
const carsById = new Map(catalog.map((car) => [Number(car.id), car]));
const agent = new https.Agent({ keepAlive: true, maxSockets: concurrency, rejectUnauthorized: false });

function relativeFile(item, bySourceId) {
  if (!item.flag || item.depth < 2 || /customer service/i.test(item.name)) return null;
  let section = item;
  while (section.depth > 1 && section.parentSourceId !== null) {
    section = bySourceId.get(section.parentSourceId);
    if (!section) return null;
  }
  const directory = /repair/i.test(section.name) ? "Repair" : /system/i.test(section.name) ? "System" : /wiring/i.test(section.name) ? "Wiring" : null;
  return directory ? `${directory}/${item.menuId}.html` : null;
}

const queue = [];
const seen = new Set();
function enqueue(url, folderName) {
  let normalized;
  try {
    normalized = new URL(url);
  } catch {
    return;
  }
  normalized.hash = "";
  normalized.search = "";
  if (normalized.origin !== "https://kks-repair.com") return;
  const prefix = `/${folderName}/html/`;
  if (!normalized.pathname.startsWith(prefix)) return;
  const key = normalized.href;
  if (seen.has(key)) return;
  let relativeUrlPath;
  try {
    relativeUrlPath = decodeURIComponent(normalized.pathname.slice(prefix.length));
  } catch {
    return;
  }
  const destination = resolve(manualsRoot, folderName, "html", ...relativeUrlPath.split("/").filter(Boolean));
  const allowedRoot = resolve(manualsRoot, folderName, "html") + sep;
  if (!destination.startsWith(allowedRoot)) return;
  seen.add(key);
  queue.push({ url: normalized.href, folderName, destination });
}

for (const manual of recovered.manuals) {
  const car = carsById.get(Number(manual.carId));
  if (!car?.folderName) continue;
  const bySourceId = new Map(manual.items.map((item) => [item.sourceId, item]));
  for (const item of manual.items) {
    const relativePath = relativeFile(item, bySourceId);
    if (!relativePath) continue;
    enqueue(`https://kks-repair.com/${encodeURIComponent(car.folderName)}/html/${relativePath.split("/").map(encodeURIComponent).join("/")}`, car.folderName);
  }
}

function fetchBuffer(url) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    };
    const request = https.get(url, { agent, headers: { "User-Agent": "KKS-Repair-Owner-Recovery/1.0", Accept: "*/*" }, timeout: 45_000 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveOnce({ status: response.statusCode ?? 0, contentType: String(response.headers["content-type"] ?? ""), body: Buffer.concat(chunks) }));
      response.on("aborted", () => rejectOnce(new Error("Response aborted")));
      response.on("error", rejectOnce);
      response.on("close", () => {
        if (!response.complete) rejectOnce(new Error("Response closed before completion"));
      });
      response.setTimeout(45_000, () => response.destroy(new Error("Response timed out")));
    });
    request.on("timeout", () => request.destroy(new Error("Request timed out")));
    request.on("error", rejectOnce);
  });
}

function discover(task, body, contentType) {
  const extension = extname(task.destination).toLowerCase();
  if (!/text|html|css|javascript|xml/i.test(contentType) && ![".html", ".htm", ".css", ".js", ".xml"].includes(extension)) return;
  const text = body.toString("utf8");
  let baseUrl = task.url;
  const baseMatch = text.match(/<base\b[^>]*href\s*=\s*["']([^"']+)["']/i);
  if (baseMatch) {
    try { baseUrl = new URL(baseMatch[1].replaceAll("\\", "/"), task.url).href; } catch {}
  }
  const candidates = [];
  for (const match of text.matchAll(/\b(?:src|href|background)\s*=\s*["']([^"'#]+)["']/gi)) candidates.push(match[1]);
  for (const match of text.matchAll(/url\(\s*["']?([^"')#]+)["']?\s*\)/gi)) candidates.push(match[1]);
  for (const candidate of candidates) {
    const cleaned = candidate.trim().replaceAll("\\", "/");
    if (!cleaned || /^(?:data|javascript|mailto|tel):/i.test(cleaned)) continue;
    try { enqueue(new URL(cleaned, baseUrl).href, task.folderName); } catch {}
  }
}

let cursor = 0;
let processed = 0;
let downloaded = 0;
let reused = 0;
let missing = 0;
let failed = 0;
let downloadedBytes = 0;
let stoppedForSize = false;
const failures = [];
const startedAt = new Date().toISOString();

async function processTask(task) {
  if (existsSync(task.destination) && statSync(task.destination).size > 0) {
    const body = readFileSync(task.destination);
    discover(task, body, "");
    return { status: "reused", bytes: 0 };
  }
  if (downloadedBytes >= maxBytes) return { status: "size-limit", bytes: 0 };
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchBuffer(task.url);
      if (response.status === 404) return { status: "missing", bytes: 0 };
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (downloadedBytes + response.body.length > maxBytes) return { status: "size-limit", bytes: 0 };
      mkdirSync(dirname(task.destination), { recursive: true });
      const temporary = `${task.destination}.part`;
      writeFileSync(temporary, response.body);
      renameSync(temporary, task.destination);
      discover(task, response.body, response.contentType);
      return { status: "downloaded", bytes: response.body.length };
    } catch (error) {
      lastError = error;
      const temporary = `${task.destination}.part`;
      if (existsSync(temporary)) unlinkSync(temporary);
      if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 750));
    }
  }
  return { status: "failed", bytes: 0, error: String(lastError?.message ?? lastError) };
}

async function worker() {
  while (!stoppedForSize) {
    if (cursor >= queue.length) return;
    const index = cursor++;
    const task = queue[index];
    const result = await processTask(task);
    processed += 1;
    downloadedBytes += result.bytes;
    if (result.status === "downloaded") downloaded += 1;
    else if (result.status === "reused") reused += 1;
    else if (result.status === "missing") missing += 1;
    else if (result.status === "size-limit") stoppedForSize = true;
    else {
      failed += 1;
      failures.push({ url: task.url, error: result.error });
    }
    if (processed % 500 === 0) console.log(JSON.stringify({ processed, discovered: queue.length, downloaded, reused, missing, failed, gigabytes: Number((downloadedBytes / 1024 ** 3).toFixed(2)) }));
  }
}

while (cursor < queue.length && !stoppedForSize) {
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
agent.destroy();
const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  discovered: queue.length,
  processed,
  downloaded,
  reused,
  missing,
  failed,
  downloadedBytes,
  stoppedForSize,
  maxBytes,
  failures,
};
mkdirSync(dirname(reportFile), { recursive: true });
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
