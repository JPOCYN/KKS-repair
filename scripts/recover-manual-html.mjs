import https from "node:https";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const currentDirectory = resolve(".");
const workspace = existsSync(join(currentDirectory, "recovery/catalog/cars.json"))
  ? currentDirectory
  : resolve("outputs/kks-repair-rebuild");
const catalog = JSON.parse(readFileSync(join(workspace, "recovery/catalog/cars.json"), "utf8"));
const recovered = JSON.parse(readFileSync(join(workspace, "recovery/catalog/manual-menus.json"), "utf8"));
const outputRoot = join(workspace, "manuals");
const reportFile = join(workspace, "recovery/manual-download-report.json");
const concurrencyArg = Number(process.argv.find((value) => value.startsWith("--concurrency="))?.split("=")[1] ?? 16);
const limitArg = Number(process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1] ?? 0);
const concurrency = Math.max(1, Math.min(32, concurrencyArg));

const carsById = new Map(catalog.map((car) => [Number(car.id), car]));

function relativeFile(item, bySourceId) {
  if (!item.flag || item.depth < 2 || /customer service/i.test(item.name)) return null;
  let section = item;
  while (section.depth > 1 && section.parentSourceId !== null) {
    section = bySourceId.get(section.parentSourceId);
    if (!section) return null;
  }
  const directory = /repair/i.test(section.name)
    ? "Repair"
    : /system/i.test(section.name)
      ? "System"
      : /wiring/i.test(section.name)
        ? "Wiring"
        : null;
  return directory ? `${directory}/${item.menuId}.html` : null;
}

const tasks = [];
for (const manual of recovered.manuals) {
  const car = carsById.get(Number(manual.carId));
  if (!car?.folderName) continue;
  const bySourceId = new Map(manual.items.map((item) => [item.sourceId, item]));
  for (const item of manual.items) {
    const relative = relativeFile(item, bySourceId);
    if (!relative) continue;
    const encodedPath = `${encodeURIComponent(car.folderName)}/html/${relative.split("/").map(encodeURIComponent).join("/")}`;
    tasks.push({
      carId: Number(manual.carId),
      folderName: car.folderName,
      relative,
      url: `https://kks-repair.com/${encodedPath}`,
      destination: join(outputRoot, car.folderName, "html", ...relative.split("/")),
    });
  }
}

const selectedTasks = limitArg > 0 ? tasks.slice(0, limitArg) : tasks;
const agent = new https.Agent({ keepAlive: true, maxSockets: concurrency, rejectUnauthorized: false });

function fetchBuffer(url) {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = https.get(url, {
      agent,
      headers: { "User-Agent": "KKS-Repair-Owner-Recovery/1.0", Accept: "text/html,*/*;q=0.8" },
      timeout: 30_000,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolvePromise({
        status: response.statusCode ?? 0,
        contentType: String(response.headers["content-type"] ?? ""),
        body: Buffer.concat(chunks),
      }));
    });
    request.on("timeout", () => request.destroy(new Error("Request timed out")));
    request.on("error", rejectPromise);
  });
}

async function download(task) {
  if (existsSync(task.destination) && statSync(task.destination).size > 100) return { status: "skipped", bytes: 0 };
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchBuffer(task.url);
      if (response.status === 404) return { status: "missing", bytes: 0 };
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (!/html/i.test(response.contentType) || response.body.length < 100) throw new Error("Unexpected response body");
      mkdirSync(dirname(task.destination), { recursive: true });
      const temporary = `${task.destination}.part`;
      writeFileSync(temporary, response.body);
      renameSync(temporary, task.destination);
      return { status: "downloaded", bytes: response.body.length };
    } catch (error) {
      lastError = error;
      const temporary = `${task.destination}.part`;
      if (existsSync(temporary)) unlinkSync(temporary);
      if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500));
    }
  }
  return { status: "failed", bytes: 0, error: String(lastError?.message ?? lastError) };
}

let cursor = 0;
let processed = 0;
let downloaded = 0;
let skipped = 0;
let missing = 0;
let failed = 0;
let bytes = 0;
const failures = [];
const startedAt = new Date().toISOString();

async function worker() {
  while (cursor < selectedTasks.length) {
    const task = selectedTasks[cursor++];
    const result = await download(task);
    processed += 1;
    bytes += result.bytes;
    if (result.status === "downloaded") downloaded += 1;
    else if (result.status === "skipped") skipped += 1;
    else if (result.status === "missing") missing += 1;
    else {
      failed += 1;
      failures.push({ url: task.url, error: result.error });
    }
    if (processed % 100 === 0 || processed === selectedTasks.length) {
      console.log(JSON.stringify({ processed, total: selectedTasks.length, downloaded, skipped, missing, failed, megabytes: Math.round(bytes / 1048576) }));
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
agent.destroy();
const report = {
  startedAt,
  finishedAt: new Date().toISOString(),
  totalDiscovered: tasks.length,
  totalSelected: selectedTasks.length,
  processed,
  downloaded,
  skipped,
  missing,
  failed,
  bytes,
  failures,
};
mkdirSync(dirname(reportFile), { recursive: true });
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
