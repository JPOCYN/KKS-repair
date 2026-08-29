import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { NextFunction, Request, RequestHandler, Response } from "express";

interface ManualBundleEntry {
  offset: number;
  length: number;
}

interface ManualBundleIndexV1 {
  version: 1;
  files: Record<string, ManualBundleEntry>;
}

interface ManualBundlePart {
  file: string;
  length: number;
}

interface ShardedManualBundleEntry extends ManualBundleEntry {
  part: number;
}

interface ManualBundleIndexV2 {
  version: 2;
  parts: ManualBundlePart[];
  files: Record<string, ShardedManualBundleEntry>;
}

type ManualBundleIndex = ManualBundleIndexV1 | ManualBundleIndexV2;

interface ByteRange {
  start: number;
  end: number;
}

export function normalizeManualPath(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const portable = decoded.replaceAll("\\", "/");
  if (portable.split("/").includes("..")) return null;
  const normalized = path.posix.normalize(portable).replace(/^\/+/, "");
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

export function parseByteRange(header: string | undefined, length: number): ByteRange | null {
  if (!header || !header.startsWith("bytes=") || length <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return null;
  if (!match[1] && !match[2]) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, length - suffix);
    end = length - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : length - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= length) return null;
    end = Math.min(end, length - 1);
  }
  return { start, end };
}

export function createManualBundleHandler(bundleFile: string, indexFile: string): RequestHandler {
  let index: ManualBundleIndex | null = null;
  let partFiles: string[] = [];

  function loadIndex(): boolean {
    if (index) return true;
    if (!existsSync(indexFile)) return false;
    const candidate = JSON.parse(readFileSync(indexFile, "utf8")) as ManualBundleIndex;
    if (!candidate.files || typeof candidate.files !== "object") throw new Error("Unsupported manual bundle index");
    if (candidate.version === 1) {
      if (!existsSync(bundleFile)) return false;
      const bundleBytes = statSync(bundleFile).size;
      partFiles = [bundleFile];
      for (const [name, entry] of Object.entries(candidate.files)) {
        if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset < 0 || entry.length < 0 || entry.offset + entry.length > bundleBytes) {
          throw new Error(`Invalid manual bundle entry: ${name}`);
        }
      }
    } else if (candidate.version === 2 && Array.isArray(candidate.parts) && candidate.parts.length > 0) {
      const indexDirectory = path.dirname(indexFile);
      partFiles = candidate.parts.map((part, partNumber) => {
        if (!/^[A-Za-z0-9._-]+$/.test(part.file) || !Number.isSafeInteger(part.length) || part.length < 0) {
          throw new Error(`Invalid manual bundle part: ${partNumber}`);
        }
        const partFile = path.join(indexDirectory, part.file);
        if (!existsSync(partFile) || statSync(partFile).size !== part.length) {
          throw new Error(`Manual bundle part is missing or incomplete: ${part.file}`);
        }
        return partFile;
      });
      for (const [name, entry] of Object.entries(candidate.files)) {
        const part = candidate.parts[entry.part];
        if (!Number.isSafeInteger(entry.part) || !part || !Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset < 0 || entry.length < 0 || entry.offset + entry.length > part.length) {
          throw new Error(`Invalid manual bundle entry: ${name}`);
        }
      }
    } else {
      throw new Error("Unsupported manual bundle index");
    }
    index = candidate;
    console.log(`Manual bundle ready: ${Object.keys(candidate.files).length} files in ${partFiles.length} part(s)`);
    return true;
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!loadIndex()) return next();
    } catch (error) {
      return next(error);
    }
    const key = normalizeManualPath(req.path);
    if (!key) return next();
    const entry = index!.files[key];
    if (!entry) return next();
    if (entry.length === 0) {
      res.status(200).type(path.extname(key)).setHeader("Content-Length", "0").end();
      return;
    }
    const range = parseByteRange(req.get("range"), entry.length);
    const relativeStart = range?.start ?? 0;
    const relativeEnd = range?.end ?? entry.length - 1;
    const responseLength = relativeEnd - relativeStart + 1;
    res.status(range ? 206 : 200);
    res.type(path.extname(key));
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", String(responseLength));
    if (range) res.setHeader("Content-Range", `bytes ${relativeStart}-${relativeEnd}/${entry.length}`);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const partNumber = index!.version === 2 ? (entry as ShardedManualBundleEntry).part : 0;
    const stream = createReadStream(partFiles[partNumber]!, { start: entry.offset + relativeStart, end: entry.offset + relativeEnd });
    stream.on("error", next);
    stream.pipe(res);
  };
}
