import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createManualBundleHandler, createRemoteManualBundleHandler, normalizeManualPath, parseByteRange } from "./manual-bundle.js";

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

test("serves protected PDF bundle entries with range headers and the PDF content type", async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "kks-bundle-pdf-"));
  const partFile = path.join(temporary, "manuals-pdfs.bundle.000");
  const indexFile = path.join(temporary, "manuals-index.json");
  const bytes = Buffer.from("%PDF-1.7\nprotected-pdf-test\n%%EOF");
  writeFileSync(partFile, bytes);
  writeFileSync(indexFile, JSON.stringify({
    version: 2,
    parts: [{ file: "manuals-pdfs.bundle.000", length: bytes.length }],
    files: { "pdfs/Test-Manual/Repair/graphics/en/large.pdf": { part: 0, offset: 0, length: bytes.length } },
  }));
  const app = express();
  app.use(createManualBundleHandler(path.join(temporary, "manuals.bundle"), indexFile));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
    const response = await fetch(`http://127.0.0.1:${address.port}/pdfs/Test-Manual/Repair/graphics/en/large.pdf`, { headers: { Range: "bytes=0-7" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-range"), `bytes 0-7/${bytes.length}`);
    assert.equal(await response.text(), "%PDF-1.7");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("proxies authenticated byte ranges from private HTTP storage", async () => {
  const bytes = Buffer.from("hello-world");
  const storage = express();
  storage.use((req, res, next) => req.get("x-kks-storage-key") === "storage-secret" ? next() : res.sendStatus(403));
  storage.get("/manuals-index.json", (_req, res) => res.json({
    version: 2,
    parts: [{ file: "manuals.bundle.000", length: bytes.length }],
    files: { "folder/file.txt": { part: 0, offset: 0, length: bytes.length } },
  }));
  storage.get("/manuals.bundle.000", (req, res) => {
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.get("range") || "");
    if (!range) return res.sendStatus(416);
    const start = Number(range[1]);
    const end = Number(range[2]);
    const body = bytes.subarray(start, end + 1);
    res.status(206).set({
      "Content-Length": String(body.length),
      "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
    }).send(body);
  });
  const storageServer = storage.listen(0);
  await new Promise<void>((resolve) => storageServer.once("listening", resolve));

  const address = storageServer.address();
  if (!address || typeof address === "string") throw new Error("Storage server did not bind to a TCP port");
  const app = express();
  app.use(createRemoteManualBundleHandler(`http://127.0.0.1:${address.port}`, "storage-secret"));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const appAddress = server.address();
    if (!appAddress || typeof appAddress === "string") throw new Error("Test server did not bind to a TCP port");
    const response = await fetch(`http://127.0.0.1:${appAddress.port}/folder/file.txt`, { headers: { Range: "bytes=6-10" } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 6-10/11");
    assert.equal(await response.text(), "world");
  } finally {
    await Promise.all([
      new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => storageServer.close((error) => error ? reject(error) : resolve())),
    ]);
  }
});
