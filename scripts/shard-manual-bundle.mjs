import { closeSync, existsSync, openSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";

const argument = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const sourceBundle = path.resolve(argument("bundle", "private-transfer/manuals.bundle"));
const sourceIndex = path.resolve(argument("index", "private-transfer/manuals-index.json"));
const outputIndex = path.resolve(argument("output-index", "private-transfer/manuals-index-v2.json"));
const partMegabytes = Number(argument("part-mb", "256"));
const partLimit = partMegabytes * 1024 * 1024;

if (!existsSync(sourceBundle) || !existsSync(sourceIndex)) throw new Error("Source manual bundle or index is missing");
if (!Number.isSafeInteger(partLimit) || partLimit < 8 * 1024 * 1024) throw new Error("--part-mb must be an integer of at least 8");
const source = JSON.parse(readFileSync(sourceIndex, "utf8"));
if (source.version !== 1 || !source.files || typeof source.files !== "object") throw new Error("A version 1 source index is required");

const entries = Object.entries(source.files).map(([name, value]) => ({ name, ...value }));
entries.sort((left, right) => left.offset - right.offset || left.name.localeCompare(right.name));
let sourceOffset = 0;
for (const entry of entries) {
  if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.length < 0 || entry.offset !== sourceOffset) {
    throw new Error(`Invalid or non-contiguous source entry: ${entry.name}`);
  }
  if (entry.length > partLimit) throw new Error(`Manual file exceeds the selected part size: ${entry.name}`);
  sourceOffset += entry.length;
}
if (sourceOffset !== statSync(sourceBundle).size) throw new Error("Source bundle size does not match its index");

const partBaseName = path.basename(sourceBundle);
const outputDirectory = path.dirname(outputIndex);
const result = { version: 2, parts: [], files: {} };
const input = openSync(sourceBundle, "r");
const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
let partNumber = -1;
let partOffset = 0;
let output = null;
let temporaryPart = "";

function finishPart() {
  if (output === null) return;
  closeSync(output);
  output = null;
  const part = result.parts[partNumber];
  const destination = path.join(outputDirectory, part.file);
  if (existsSync(destination)) unlinkSync(destination);
  renameSync(temporaryPart, destination);
  console.log(JSON.stringify({ part: partNumber + 1, file: part.file, bytes: part.length }));
}

function startPart() {
  finishPart();
  partNumber += 1;
  partOffset = 0;
  const file = `${partBaseName}.${String(partNumber).padStart(3, "0")}`;
  temporaryPart = path.join(outputDirectory, `${file}.part`);
  output = openSync(temporaryPart, "w");
  result.parts.push({ file, length: 0 });
}

try {
  for (const entry of entries) {
    if (output === null || (partOffset > 0 && partOffset + entry.length > partLimit)) startPart();
    result.files[entry.name] = { part: partNumber, offset: partOffset, length: entry.length };
    let copied = 0;
    while (copied < entry.length) {
      const bytes = readSync(input, buffer, 0, Math.min(buffer.length, entry.length - copied), entry.offset + copied);
      if (bytes <= 0) throw new Error(`Unexpected end of source bundle: ${entry.name}`);
      writeSync(output, buffer, 0, bytes, partOffset + copied);
      copied += bytes;
    }
    partOffset += entry.length;
    result.parts[partNumber].length = partOffset;
  }
  finishPart();
} finally {
  closeSync(input);
  if (output !== null) closeSync(output);
}

const temporaryIndex = `${outputIndex}.part`;
writeFileSync(temporaryIndex, `${JSON.stringify(result)}\n`);
if (existsSync(outputIndex)) unlinkSync(outputIndex);
renameSync(temporaryIndex, outputIndex);
console.log(JSON.stringify({ passed: true, files: entries.length, parts: result.parts.length, bytes: sourceOffset, outputIndex }, null, 2));
