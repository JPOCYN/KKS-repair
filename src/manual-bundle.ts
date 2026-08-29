import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { NextFunction, Request, RequestHandler, Response } from "express";

interface ManualBundleEntry {
  offset: number;
  length: number;
}

interface ManualBundleIndex {
  version: 1;
  files: Record<string, ManualBundleEntry>;
}

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

  function loadIndex(): boolean {
    if (index) return true;
    if (!existsSync(bundleFile) || !existsSync(indexFile)) return false;
    const candidate = JSON.parse(readFileSync(indexFile, "utf8")) as ManualBundleIndex;
    if (candidate.version !== 1 || !candidate.files || typeof candidate.files !== "object") throw new Error("Unsupported manual bundle index");
    const bundleBytes = statSync(bundleFile).size;
    for (const [name, entry] of Object.entries(candidate.files)) {
      if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset < 0 || entry.length < 0 || entry.offset + entry.length > bundleBytes) {
        throw new Error(`Invalid manual bundle entry: ${name}`);
      }
    }
    index = candidate;
    console.log(`Manual bundle ready: ${Object.keys(candidate.files).length} files`);
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
    const stream = createReadStream(bundleFile, { start: entry.offset + relativeStart, end: entry.offset + relativeEnd });
    stream.on("error", next);
    stream.pipe(res);
  };
}
