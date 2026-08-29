import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeManualPath } from "./manual-bundle.js";
import {
  createSupabaseServerClient,
  readSupabaseServerConfig,
  requireExpectedSupabaseProject,
} from "./supabase-client.js";
import { discoverManualFiles, type ManualFile } from "./upload-supabase-manuals.js";

interface VerificationOptions {
  bucket: string;
  root: string;
  sampleSize: number;
}

interface RemoteManualFile {
  objectPath: string;
  size: number;
}

function positiveInteger(value: string | undefined, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
  return number;
}

export function parseManualVerificationOptions(arguments_: string[]): VerificationOptions {
  let bucket = process.env.SUPABASE_MANUAL_BUCKET?.trim() || "manuals";
  let root = process.env.MANUALS_DIR || "manuals";
  let sampleSize = 25;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    const equalsIndex = argument.indexOf("=");
    const name = equalsIndex < 0 ? argument : argument.slice(0, equalsIndex);
    const inlineValue = equalsIndex < 0 ? undefined : argument.slice(equalsIndex + 1);
    if (name === "--bucket") bucket = inlineValue ?? arguments_[++index] ?? "";
    else if (name === "--root") root = inlineValue ?? arguments_[++index] ?? "";
    else if (name === "--sample-size") sampleSize = positiveInteger(inlineValue ?? arguments_[++index], "--sample-size");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(bucket)) throw new Error("--bucket is invalid");
  if (!root) throw new Error("--root requires a path");
  if (sampleSize > 100) throw new Error("--sample-size cannot exceed 100");
  return { bucket, root: path.resolve(root), sampleSize };
}

export function selectVerificationSamples(files: ManualFile[], requested: number): ManualFile[] {
  if (files.length <= requested) return [...files];
  const selected = new Map<string, ManualFile>();
  for (let index = 0; index < requested; index += 1) {
    const position = Math.round(index * (files.length - 1) / Math.max(1, requested - 1));
    const file = files[position];
    if (file) selected.set(file.objectPath, file);
  }
  const largest = files.reduce((current, file) => file.size > current.size ? file : current, files[0]!);
  selected.set(largest.objectPath, largest);
  return [...selected.values()].sort((left, right) => left.objectPath.localeCompare(right.objectPath));
}

function remotePath(bucket: string, key: string | undefined, name: string): string {
  let candidate = (key || name).replace(/^\/+/, "");
  if (candidate.startsWith(`${bucket}/`)) candidate = candidate.slice(bucket.length + 1);
  const normalized = normalizeManualPath(candidate);
  if (!normalized) throw new Error(`Storage returned an unsafe object path: ${candidate}`);
  return normalized;
}

async function listRemoteManuals(bucket: string): Promise<RemoteManualFile[]> {
  const client = createSupabaseServerClient();
  const result: RemoteManualFile[] = [];
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  do {
    const { data, error } = await client.storage.from(bucket).listV2({
      cursor,
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
      with_delimiter: false,
    });
    if (error) throw new Error(`Cannot list Storage objects: ${error.message}`);
    for (const object of data.objects) {
      const size = Number(object.metadata?.size ?? object.metadata?.contentLength);
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(`Storage object is missing a valid size: ${object.key || object.name}`);
      }
      result.push({ objectPath: remotePath(bucket, object.key, object.name), size });
    }
    if (!data.hasNext) break;
    if (!data.nextCursor || seenCursors.has(data.nextCursor)) throw new Error("Storage pagination returned an invalid cursor");
    seenCursors.add(data.nextCursor);
    cursor = data.nextCursor;
  } while (true);
  return result;
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function verifyManuals(options: VerificationOptions): Promise<void> {
  const config = readSupabaseServerConfig();
  const projectRef = requireExpectedSupabaseProject(config);
  const client = createSupabaseServerClient(config);
  const { data: buckets, error: bucketError } = await client.storage.listBuckets();
  if (bucketError) throw new Error(`Cannot list Storage buckets: ${bucketError.message}`);
  const bucket = buckets.find((candidate) => candidate.name === options.bucket);
  if (!bucket) throw new Error(`Private Storage bucket does not exist: ${options.bucket}`);
  if (bucket.public) throw new Error(`Storage bucket ${options.bucket} must be private`);

  const localFiles = await discoverManualFiles(options.root, null);
  const remoteFiles = await listRemoteManuals(options.bucket);
  const localByPath = new Map(localFiles.map((file) => [file.objectPath, file]));
  const remoteByPath = new Map<string, RemoteManualFile>();
  for (const file of remoteFiles) {
    if (remoteByPath.has(file.objectPath)) throw new Error(`Duplicate Storage object: ${file.objectPath}`);
    remoteByPath.set(file.objectPath, file);
  }

  const missing = localFiles.filter((file) => !remoteByPath.has(file.objectPath));
  const extra = remoteFiles.filter((file) => !localByPath.has(file.objectPath));
  const sizeMismatches = localFiles.filter((file) => {
    const remote = remoteByPath.get(file.objectPath);
    return remote && remote.size !== file.size;
  });
  if (missing.length || extra.length || sizeMismatches.length) {
    throw new Error(JSON.stringify({
      missing: missing.slice(0, 10).map((file) => file.objectPath),
      extra: extra.slice(0, 10).map((file) => file.objectPath),
      sizeMismatches: sizeMismatches.slice(0, 10).map((file) => file.objectPath),
      totals: { missing: missing.length, extra: extra.length, sizeMismatches: sizeMismatches.length },
    }));
  }

  const samples = selectVerificationSamples(localFiles, options.sampleSize);
  for (const file of samples) {
    const [local, remote] = await Promise.all([
      readFile(file.absolutePath),
      client.storage.from(options.bucket).download(file.objectPath),
    ]);
    if (remote.error) throw new Error(`Cannot download verification sample ${file.objectPath}: ${remote.error.message}`);
    const remoteBytes = Buffer.from(await remote.data.arrayBuffer());
    if (sha256(local) !== sha256(remoteBytes)) throw new Error(`Content hash mismatch: ${file.objectPath}`);
  }

  console.log(JSON.stringify({
    projectRef,
    bucket: options.bucket,
    files: localFiles.length,
    bytes: localFiles.reduce((sum, file) => sum + file.size, 0),
    samplesVerified: samples.length,
    complete: true,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseManualVerificationOptions(process.argv.slice(2));
  verifyManuals(options).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
