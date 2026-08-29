import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";

const argument = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseIndexFile = path.resolve(argument("base-index", "private-transfer/manuals-index-v2.json"));
const sourceDirectory = path.resolve(argument("source", "modern-manuals/pdfs"));
const outputIndexFile = path.resolve(argument("output-index", "private-transfer/manuals-index-modern.json"));
const keyPrefix = argument("prefix", "pdfs").replace(/^\/+|\/+$/g, "");
const partBaseName = argument("part-name", "manuals-pdfs.bundle");
const partMegabytes = Number(argument("part-mb", "256"));
const partLimit = partMegabytes * 1024 * 1024;

if (!existsSync(baseIndexFile)) throw new Error(`Base index not found: ${baseIndexFile}`);
if (!existsSync(sourceDirectory)) throw new Error(`Extension source not found: ${sourceDirectory}`);
if (path.dirname(baseIndexFile) !== path.dirname(outputIndexFile)) throw new Error("Base and output indexes must share a directory so existing parts remain available");
if (!/^[A-Za-z0-9._-]+$/.test(partBaseName)) throw new Error("--part-name contains unsupported characters");
if (!keyPrefix || keyPrefix.split("/").some((part) => !part || part === "..")) throw new Error("--prefix is invalid");
if (!Number.isSafeInteger(partLimit) || partLimit < 8 * 1024 * 1024) throw new Error("--part-mb must be an integer of at least 8");
if (existsSync(outputIndexFile)) throw new Error(`Output index already exists: ${outputIndexFile}`);

const base = JSON.parse(readFileSync(baseIndexFile, "utf8"));
if (base.version !== 2 || !Array.isArray(base.parts) || !base.files || typeof base.files !== "object") {
  throw new Error("A version 2 base index is required");
}

for (const [partNumber, part] of base.parts.entries()) {
  if (!/^[A-Za-z0-9._-]+$/.test(part.file) || !Number.isSafeInteger(part.length) || part.length < 0) {
    throw new Error(`Invalid base part: ${partNumber}`);
  }
  const partFile = path.join(path.dirname(baseIndexFile), part.file);
  if (!existsSync(partFile) || statSync(partFile).size !== part.length) throw new Error(`Base part is missing or incomplete: ${part.file}`);
}

const sourceFiles = [];
const pending = [sourceDirectory];
while (pending.length > 0) {
  const directory = pending.pop();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) pending.push(target);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) sourceFiles.push(target);
  }
}
sourceFiles.sort((left, right) => left.localeCompare(right));
if (sourceFiles.length === 0) throw new Error("No PDF files were found in the extension source");

mkdirSync(path.dirname(outputIndexFile), { recursive: true });
const result = {
  version: 2,
  parts: base.parts.map((part) => ({ ...part })),
  files: Object.fromEntries(Object.entries(base.files).map(([name, entry]) => [name, { ...entry }])),
};
const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
const createdParts = [];
let output = null;
let temporaryPart = "";
let currentPart = null;
let extensionPartNumber = -1;
let extensionBytes = 0;

function finishPart() {
  if (output === null || !currentPart) return;
  closeSync(output);
  output = null;
  const destination = path.join(path.dirname(outputIndexFile), currentPart.file);
  renameSync(temporaryPart, destination);
  createdParts.push(destination);
  console.log(JSON.stringify({ file: currentPart.file, bytes: currentPart.length }));
}

function startPart() {
  finishPart();
  extensionPartNumber += 1;
  const file = `${partBaseName}.${String(extensionPartNumber).padStart(3, "0")}`;
  const destination = path.join(path.dirname(outputIndexFile), file);
  if (existsSync(destination)) throw new Error(`Extension part already exists: ${destination}`);
  temporaryPart = `${destination}.part`;
  if (existsSync(temporaryPart)) throw new Error(`Temporary extension part already exists: ${temporaryPart}`);
  output = openSync(temporaryPart, "wx");
  currentPart = { file, length: 0 };
  result.parts.push(currentPart);
}

try {
  for (let position = 0; position < sourceFiles.length; position += 1) {
    const sourceFile = sourceFiles[position];
    const length = statSync(sourceFile).size;
    if (length > partLimit) throw new Error(`PDF exceeds the selected part size: ${sourceFile}`);
    if (output === null || (currentPart.length > 0 && currentPart.length + length > partLimit)) startPart();
    const relative = path.relative(sourceDirectory, sourceFile).split(path.sep).join("/");
    const key = `${keyPrefix}/${relative}`;
    if (result.files[key]) throw new Error(`Bundle path already exists: ${key}`);
    const part = result.parts.length - 1;
    const offset = currentPart.length;
    result.files[key] = { part, offset, length };

    const input = openSync(sourceFile, "r");
    try {
      let copied = 0;
      while (copied < length) {
        const bytes = readSync(input, buffer, 0, Math.min(buffer.length, length - copied), copied);
        if (bytes <= 0) throw new Error(`Unexpected end of PDF: ${sourceFile}`);
        writeSync(output, buffer, 0, bytes, offset + copied);
        copied += bytes;
      }
    } finally {
      closeSync(input);
    }
    currentPart.length += length;
    extensionBytes += length;
    if ((position + 1) % 100 === 0) console.log(JSON.stringify({ processed: position + 1, total: sourceFiles.length }));
  }
  finishPart();
  const temporaryIndex = `${outputIndexFile}.part`;
  writeFileSync(temporaryIndex, `${JSON.stringify(result)}\n`, { flag: "wx" });
  renameSync(temporaryIndex, outputIndexFile);
} catch (error) {
  if (output !== null) closeSync(output);
  if (temporaryPart && existsSync(temporaryPart)) unlinkSync(temporaryPart);
  throw error;
}

console.log(JSON.stringify({
  passed: true,
  baseFiles: Object.keys(base.files).length,
  addedFiles: sourceFiles.length,
  totalFiles: Object.keys(result.files).length,
  baseParts: base.parts.length,
  addedParts: createdParts.length,
  totalParts: result.parts.length,
  addedBytes: extensionBytes,
  outputIndexFile,
}, null, 2));
