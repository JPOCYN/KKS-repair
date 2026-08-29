import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createManualBundleHandler, normalizeManualPath, parseByteRange } from "./manual-bundle.js";

test("manual paths are normalized without allowing traversal", () => {
  assert.equal(normalizeManualPath("/folder/html/Repair/123.html"), "folder/html/Repair/123.html");
  assert.equal(normalizeManualPath("/%2e%2e/private-data/file"), null);
  assert.equal(normalizeManualPath("/folder/../../private-data/file"), null);
  assert.equal(normalizeManualPath("/%E0%A4%A"), null);
});

test("byte ranges are bounded to one bundle entry", () => {
  assert.deepEqual(parseByteRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseByteRange("bytes=90-", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.equal(parseByteRange("bytes=100-101", 100), null);
  assert.equal(parseByteRange("items=0-1", 100), null);
});

test("serves byte ranges from a version 2 bundle part", async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "kks-bundle-v2-"));
  const partFile = path.join(temporary, "manuals.bundle.000");
  const indexFile = path.join(temporary, "manuals-index.json");
  writeFileSync(partFile, "hello-world");
  writeFileSync(indexFile, JSON.stringify({
    version: 2,
    parts: [{ file: "manuals.bundle.000", length: 11 }],
    files: { "folder/file.txt": { part: 0, offset: 0, length: 11 } },
  }));
  const app = express();
  app.use(createManualBundleHandler(path.join(temporary, "manuals.bundle"), indexFile));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
    const response = await fetch(`http://127.0.0.1:${address.port}/folder/file.txt`, { headers: { Range: "bytes=6-10" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 6-10/11");
    assert.equal(await response.text(), "world");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(temporary, { recursive: true, force: true });
  }
});
