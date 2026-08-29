import { closeSync, existsSync, mkdirSync, openSync, readSync, readdirSync, renameSync, statSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";

const argument = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const sourceDirectory = path.resolve(argument("source", "manuals"));
const bundleFile = path.resolve(argument("bundle", "private-transfer/manuals.bundle"));
const indexFile = path.resolve(argument("index", "private-transfer/manuals-index.json"));
if (!existsSync(sourceDirectory)) throw new Error(`Manual directory not found: ${sourceDirectory}`);
const relativeBundle = path.relative(sourceDirectory, bundleFile);
const relativeIndex = path.relative(sourceDirectory, indexFile);
if (!relativeBundle.startsWith("..") || !relativeIndex.startsWith("..")) throw new Error("Bundle outputs must be outside the manual source directory");

const files = [];
const pending = [sourceDirectory];
while (pending.length > 0) {
  const directory = pending.pop();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) pending.push(target);
    else if (entry.isFile() && !entry.name.endsWith(".part")) files.push(target);
  }
}
files.sort((left, right) => left.localeCompare(right));
mkdirSync(path.dirname(bundleFile), { recursive: true });
mkdirSync(path.dirname(indexFile), { recursive: true });
const temporaryBundle = `${bundleFile}.part`;
const temporaryIndex = `${indexFile}.part`;
const output = openSync(temporaryBundle, "w");
const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
const index = { version: 1, files: {} };
let offset = 0;
try {
  for (let position = 0; position < files.length; position += 1) {
    const file = files[position];
    const length = statSync(file).size;
    const key = path.relative(sourceDirectory, file).split(path.sep).join("/");
    index.files[key] = { offset, length };
    const input = openSync(file, "r");
    try {
      let fileOffset = 0;
      while (fileOffset < length) {
        const bytesRead = readSync(input, buffer, 0, Math.min(buffer.length, length - fileOffset), fileOffset);
        if (bytesRead <= 0) throw new Error(`Unexpected end of file: ${file}`);
        writeSync(output, buffer, 0, bytesRead, offset + fileOffset);
        fileOffset += bytesRead;
      }
    } finally {
      closeSync(input);
    }
    offset += length;
    if ((position + 1) % 1000 === 0) console.log(JSON.stringify({ processed: position + 1, total: files.length, gigabytes: Number((offset / 1024 ** 3).toFixed(2)) }));
  }
} finally {
  closeSync(output);
}
writeFileSync(temporaryIndex, `${JSON.stringify(index)}\n`);
renameSync(temporaryBundle, bundleFile);
renameSync(temporaryIndex, indexFile);
console.log(JSON.stringify({ files: files.length, bytes: offset, bundleFile, indexFile }, null, 2));
