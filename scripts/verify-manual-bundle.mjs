import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const argument = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const sourceDirectory = path.resolve(argument("source", "manuals"));
const extraSourceDirectory = argument("extra-source", "") ? path.resolve(argument("extra-source", "")) : null;
const extraPrefix = argument("extra-prefix", "pdfs").replace(/^\/+|\/+$/g, "");
const allowIndexSuperset = argument("allow-index-superset", "false") === "true";
const requestedSamples = process.argv.filter((value) => value.startsWith("--sample=")).map((value) => value.slice(9));
const bundleFile = path.resolve(argument("bundle", "private-transfer/manuals.bundle"));
const indexFile = path.resolve(argument("index", "private-transfer/manuals-index.json"));

if (!existsSync(indexFile)) throw new Error("Manual bundle index is missing");
const index = JSON.parse(readFileSync(indexFile, "utf8"));
if (![1, 2].includes(index.version) || !index.files || typeof index.files !== "object") throw new Error("Unsupported manual bundle index");

let parts;
if (index.version === 1) {
  if (!existsSync(bundleFile)) throw new Error("Manual bundle is missing");
  parts = [{ file: bundleFile, length: statSync(bundleFile).size }];
} else {
  if (!Array.isArray(index.parts) || index.parts.length === 0) throw new Error("Sharded manual bundle has no parts");
  parts = index.parts.map((part, partNumber) => {
    if (!/^[A-Za-z0-9._-]+$/.test(part.file) || !Number.isSafeInteger(part.length) || part.length < 0) throw new Error(`Invalid bundle part: ${partNumber}`);
    const file = path.join(path.dirname(indexFile), part.file);
    if (!existsSync(file) || statSync(file).size !== part.length) throw new Error(`Bundle part is missing or incomplete: ${part.file}`);
    return { file, length: part.length };
  });
}

const entries = Object.entries(index.files).map(([name, value]) => ({ name, part: index.version === 1 ? 0 : value.part, ...value }));
entries.sort((left, right) => left.part - right.part || left.offset - right.offset || left.name.localeCompare(right.name));
const expectedOffsets = parts.map(() => 0);
for (const entry of entries) {
  if (entry.name.includes("\\") || entry.name.split("/").includes("..")) throw new Error(`Unsafe manual path: ${entry.name}`);
  if (!Number.isSafeInteger(entry.part) || !parts[entry.part] || !Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.length < 0) throw new Error(`Invalid bundle entry: ${entry.name}`);
  if (entry.offset !== expectedOffsets[entry.part]) throw new Error(`Non-contiguous bundle entry: ${entry.name}`);
  expectedOffsets[entry.part] += entry.length;
}
for (let partNumber = 0; partNumber < parts.length; partNumber += 1) {
  if (expectedOffsets[partNumber] !== parts[partNumber].length) throw new Error(`Bundle part size mismatch: ${partNumber}`);
}
const bundleBytes = parts.reduce((total, part) => total + part.length, 0);
const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));

const sourceFiles = new Map();
function collectSource(rootDirectory, prefix = "") {
  const pending = [rootDirectory];
  while (pending.length > 0) {
    const currentDirectory = pending.pop();
    for (const item of readdirSync(currentDirectory, { withFileTypes: true })) {
      const target = path.join(currentDirectory, item.name);
      if (item.isDirectory()) pending.push(target);
      else if (item.isFile() && !item.name.endsWith(".part")) {
        const relative = path.relative(rootDirectory, target).split(path.sep).join("/");
        sourceFiles.set(prefix ? `${prefix}/${relative}` : relative, statSync(target).size);
      }
    }
  }
}
if (existsSync(sourceDirectory)) {
  collectSource(sourceDirectory);
  if (extraSourceDirectory) {
    if (!existsSync(extraSourceDirectory)) throw new Error(`Extra source directory is missing: ${extraSourceDirectory}`);
    collectSource(extraSourceDirectory, extraPrefix);
  }
  if (!allowIndexSuperset && sourceFiles.size !== entries.length) throw new Error(`File count mismatch: source=${sourceFiles.size}, index=${entries.length}`);
  for (const [name, length] of sourceFiles) {
    if (entriesByName.get(name)?.length !== length) throw new Error(`Source size mismatch: ${name}`);
  }
}

function hashSource(name) {
  const extraMarker = `${extraPrefix}/`;
  const file = extraSourceDirectory && name.startsWith(extraMarker)
    ? path.join(extraSourceDirectory, ...name.slice(extraMarker.length).split("/"))
    : path.join(sourceDirectory, ...name.split("/"));
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function hashBundle(entry) {
  const hash = createHash("sha256");
  const descriptor = openSync(parts[entry.part].file, "r");
  const buffer = Buffer.allocUnsafe(Math.min(4 * 1024 * 1024, Math.max(1, entry.length)));
  try {
    let consumed = 0;
    while (consumed < entry.length) {
      const bytes = readSync(descriptor, buffer, 0, Math.min(buffer.length, entry.length - consumed), entry.offset + consumed);
      if (bytes <= 0) throw new Error(`Unexpected end of bundle: ${entry.name}`);
      hash.update(buffer.subarray(0, bytes));
      consumed += bytes;
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

const candidates = [entries[0], entries[Math.floor(entries.length / 2)], entries.at(-1), entries.reduce((largest, entry) => entry.length > largest.length ? entry : largest, entries[0]), ...requestedSamples.map((name) => {
  const entry = entriesByName.get(name);
  if (!entry) throw new Error(`Requested sample is not indexed: ${name}`);
  return entry;
})];
const samples = [];
for (const entry of new Map(candidates.filter(Boolean).map((entry) => [entry.name, entry])).values()) {
  const bundleSha256 = hashBundle(entry);
  const sourceSha256 = sourceFiles.has(entry.name) ? hashSource(entry.name) : null;
  if (sourceSha256 && sourceSha256 !== bundleSha256) throw new Error(`Bundle content mismatch: ${entry.name}`);
  samples.push({ path: entry.name, bytes: entry.length, sha256: bundleSha256 });
}

console.log(JSON.stringify({
  passed: true,
  files: entries.length,
  parts: parts.length,
  bytes: bundleBytes,
  sourceCompared: sourceFiles.size > 0,
  samples,
}, null, 2));
