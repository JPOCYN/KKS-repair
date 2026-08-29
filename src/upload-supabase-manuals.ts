import { createReadStream } from "node:fs";
import { appendFile, mkdir, open, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { lookup as mimeTypeForPath } from "mime-types";
import { Upload } from "tus-js-client";
import { normalizeManualPath } from "./manual-bundle.js";
import {
  createSupabaseServerClient,
  readSupabaseServerConfig,
  requireExpectedSupabaseProject,
} from "./supabase-client.js";

interface UploadOptions {
  apply: boolean;
  bucket: string;
  concurrency: number;
  limit: number | null;
  root: string;
  stateFile: string;
}

export interface ManualFile {
  absolutePath: string;
  modifiedMs: number;
  objectPath: string;
  size: number;
}

interface CompletedUpload {
  path: string;
  size: number;
  modifiedMs: number;
}

const resumableUploadThreshold = 6 * 1024 * 1024;
const resumableChunkSize = 6 * 1024 * 1024;

function positiveInteger(value: string | undefined, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
  return number;
}

export function parseManualUploadOptions(arguments_: string[]): UploadOptions {
  let apply = false;
  let bucket = process.env.SUPABASE_MANUAL_BUCKET?.trim() || "manuals";
  let concurrency = 8;
  let limit: number | null = null;
  let root = process.env.MANUALS_DIR || "manuals";
  let stateFile = process.env.SUPABASE_MANUAL_UPLOAD_STATE || path.join("data", "supabase-manual-upload.jsonl");
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    const equalsIndex = argument.indexOf("=");
    const name = equalsIndex < 0 ? argument : argument.slice(0, equalsIndex);
    const inlineValue = equalsIndex < 0 ? undefined : argument.slice(equalsIndex + 1);
    if (name === "--apply" && inlineValue === undefined) apply = true;
    else if (name === "--bucket") bucket = inlineValue ?? arguments_[++index] ?? "";
    else if (name === "--concurrency") concurrency = positiveInteger(inlineValue ?? arguments_[++index], "--concurrency");
    else if (name === "--limit") limit = positiveInteger(inlineValue ?? arguments_[++index], "--limit");
    else if (name === "--root") root = inlineValue ?? arguments_[++index] ?? "";
    else if (name === "--state-file") stateFile = inlineValue ?? arguments_[++index] ?? "";
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(bucket)) throw new Error("--bucket is invalid");
  if (!root) throw new Error("--root requires a path");
  if (!stateFile) throw new Error("--state-file requires a path");
  if (concurrency > 32) throw new Error("--concurrency cannot exceed 32");
  return {
    apply,
    bucket,
    concurrency,
    limit,
    root: path.resolve(root),
    stateFile: path.resolve(stateFile),
  };
}

export async function discoverManualFiles(root: string, limit: number | null): Promise<ManualFile[]> {
  const rootStats = await stat(root);
  if (!rootStats.isDirectory()) throw new Error(`Manual root is not a directory: ${root}`);
  const result: ManualFile[] = [];

  async function visit(directory: string): Promise<boolean> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Manual tree contains a symlink: ${absolutePath}`);
      if (entry.isDirectory()) {
        if (await visit(absolutePath)) return true;
      } else if (entry.isFile()) {
        const relative = path.relative(root, absolutePath).replaceAll(path.sep, "/");
        const objectPath = normalizeManualPath(relative);
        if (!objectPath) throw new Error(`Unsafe manual object path: ${relative}`);
        const metadata = await stat(absolutePath);
        result.push({
          absolutePath,
          modifiedMs: Math.trunc(metadata.mtimeMs),
          objectPath,
          size: metadata.size,
        });
        if (limit !== null && result.length >= limit) return true;
      }
    }
    return false;
  }

  await visit(root);
  return result;
}

async function readCompletedUploads(stateFile: string): Promise<Map<string, CompletedUpload>> {
  const completed = new Map<string, CompletedUpload>();
  try {
    const source = await readFile(stateFile, "utf8");
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      let parsed: CompletedUpload;
      try {
        parsed = JSON.parse(line) as CompletedUpload;
      } catch {
        throw new Error(`Invalid upload state at line ${index + 1}`);
      }
      if (typeof parsed.path !== "string" || !Number.isFinite(parsed.size) || !Number.isFinite(parsed.modifiedMs)) {
        throw new Error(`Invalid upload state at line ${index + 1}`);
      }
      completed.set(parsed.path, parsed);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return completed;
}

function alreadyCompleted(file: ManualFile, completed: Map<string, CompletedUpload>): boolean {
  const previous = completed.get(file.objectPath);
  return previous?.size === file.size && previous.modifiedMs === file.modifiedMs;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function uploadLargeManual(
  file: ManualFile,
  bucket: string,
  contentType: string,
  projectRef: string,
  secretKey: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(createReadStream(file.absolutePath), {
      endpoint: `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
        "x-upsert": "true",
      },
      chunkSize: resumableChunkSize,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: file.objectPath,
        contentType,
        cacheControl: "31536000",
      },
      onError: reject,
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

async function uploadManuals(options: UploadOptions): Promise<void> {
  const files = await discoverManualFiles(options.root, options.limit);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  console.log(JSON.stringify({
    mode: options.apply ? "apply" : "dry-run",
    root: options.root,
    bucket: options.bucket,
    files: files.length,
    bytes: totalBytes,
    limited: options.limit !== null,
  }));
  if (!options.apply) {
    console.log("Dry run complete. Add --apply only after confirming the expected project ref and applying the database migration.");
    return;
  }

  const config = readSupabaseServerConfig();
  const projectRef = requireExpectedSupabaseProject(config);
  const client = createSupabaseServerClient(config);
  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) throw new Error(`Cannot list Storage buckets: ${listError.message}`);
  const existing = buckets.find((bucket) => bucket.name === options.bucket);
  if (existing?.public) throw new Error(`Storage bucket ${options.bucket} exists but is public`);
  if (existing?.type && existing.type !== "STANDARD") throw new Error(`Storage bucket ${options.bucket} is not a standard file bucket`);
  if (existing?.file_size_limit !== undefined && existing.file_size_limit < 10 * 1024 * 1024) {
    throw new Error(`Storage bucket ${options.bucket} must allow files up to 10 MB`);
  }
  if (existing?.allowed_mime_types?.length) {
    throw new Error(`Storage bucket ${options.bucket} must not restrict MIME types for the recovered manual corpus`);
  }
  if (!existing) {
    const { error } = await client.storage.createBucket(options.bucket, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
    });
    if (error) throw new Error(`Cannot create private Storage bucket ${options.bucket}: ${error.message}`);
  }

  const completed = await readCompletedUploads(options.stateFile);
  await mkdir(path.dirname(options.stateFile), { recursive: true });
  const stateHandle = await open(options.stateFile, "a");
  await stateHandle.close();
  let stateWrites = Promise.resolve();
  let cursor = 0;
  let skipped = 0;
  let uploaded = 0;
  let uploadedBytes = 0;

  async function record(file: ManualFile): Promise<void> {
    const line = `${JSON.stringify({ path: file.objectPath, size: file.size, modifiedMs: file.modifiedMs })}\n`;
    stateWrites = stateWrites.then(() => appendFile(options.stateFile, line, "utf8"));
    await stateWrites;
  }

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      const file = files[index];
      if (!file) return;
      if (alreadyCompleted(file, completed)) {
        skipped += 1;
        continue;
      }

      const contentType = mimeTypeForPath(file.objectPath) || "application/octet-stream";
      if (file.size > resumableUploadThreshold) {
        try {
          await uploadLargeManual(file, options.bucket, contentType, projectRef, config.secretKey);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Resumable upload failed: ${file.objectPath}: ${message}`);
        }
      } else {
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= 5; attempt += 1) {
          const body = await readFile(file.absolutePath);
          const { error } = await client.storage.from(options.bucket).upload(file.objectPath, body, {
            cacheControl: "31536000",
            contentType,
            upsert: true,
          });
          if (!error) {
            lastError = null;
            break;
          }
          lastError = new Error(error.message);
          if (attempt < 5) await wait(Math.min(30_000, 1000 * (2 ** (attempt - 1))));
        }
        if (lastError) throw new Error(`Upload failed after retries: ${file.objectPath}: ${lastError.message}`);
      }

      await record(file);
      uploaded += 1;
      uploadedBytes += file.size;
      if ((uploaded + skipped) % 250 === 0) {
        console.log(JSON.stringify({ projectRef, processed: uploaded + skipped, uploaded, skipped, uploadedBytes, total: files.length }));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.concurrency, files.length || 1) }, () => worker()));
  await stateWrites;
  console.log(JSON.stringify({ projectRef, bucket: options.bucket, uploaded, skipped, uploadedBytes, total: files.length, complete: true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseManualUploadOptions(process.argv.slice(2));
  uploadManuals(options).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
