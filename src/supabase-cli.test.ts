import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { parseMigrationOptions } from "./migrate-supabase.js";
import { parseManualUploadOptions } from "./upload-supabase-manuals.js";
import {
  parseManualVerificationOptions,
  selectVerificationSamples,
} from "./verify-supabase-manuals.js";

test("Supabase migration options accept both separated and inline values", () => {
  const database = path.resolve("data", "source.db");
  assert.deepEqual(parseMigrationOptions([
    "--apply",
    "--allow-extra",
    `--database=${database}`,
    "--batch-size",
    "250",
  ]), {
    apply: true,
    allowExtraRows: true,
    batchSize: 250,
    databaseFile: database,
  });
  assert.throws(() => parseMigrationOptions(["--batch-size=1001"]), /cannot exceed 1000/);
  assert.throws(() => parseMigrationOptions(["--apply=yes"]), /Unknown argument/);
});

test("manual upload options accept npm-friendly inline values and validate bounds", () => {
  const root = path.resolve("manuals");
  const stateFile = path.resolve("data", "upload-state.jsonl");
  assert.deepEqual(parseManualUploadOptions([
    "--apply",
    "--bucket=kks-manuals",
    "--concurrency=4",
    "--limit=10",
    `--root=${root}`,
    "--state-file",
    stateFile,
  ]), {
    apply: true,
    bucket: "kks-manuals",
    concurrency: 4,
    limit: 10,
    root,
    stateFile,
  });
  assert.throws(() => parseManualUploadOptions(["--concurrency=33"]), /cannot exceed 32/);
  assert.throws(() => parseManualUploadOptions(["--bucket=invalid bucket"]), /bucket is invalid/);
});

test("manual verification options and deterministic samples include the largest file", () => {
  const root = path.resolve("manuals");
  assert.deepEqual(parseManualVerificationOptions([
    "--bucket=kks-manuals",
    `--root=${root}`,
    "--sample-size=2",
  ]), { bucket: "kks-manuals", root, sampleSize: 2 });
  const files = [
    { absolutePath: "a", modifiedMs: 1, objectPath: "a", size: 1 },
    { absolutePath: "b", modifiedMs: 1, objectPath: "b", size: 100 },
    { absolutePath: "c", modifiedMs: 1, objectPath: "c", size: 2 },
  ];
  assert.deepEqual(selectVerificationSamples(files, 2).map((file) => file.objectPath), ["a", "b", "c"]);
  assert.throws(() => parseManualVerificationOptions(["--sample-size=101"]), /cannot exceed 100/);
});
