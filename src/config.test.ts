import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadAppConfig } from "./config.js";

test("loads Hostinger-first defaults with absolute storage paths", () => {
  const root = path.resolve("fixture-root");
  const config = loadAppConfig({}, root);
  assert.equal(config.port, 3000);
  assert.equal(config.production, false);
  assert.equal(config.manualStorage, "local");
  assert.equal(config.publicDirectory, path.join(root, "public"));
  assert.equal(config.manualBundleFile, path.join(root, "private-data", "manuals.bundle"));
});

test("preserves future storage configuration and rejects unknown values", () => {
  const config = loadAppConfig({
    NODE_ENV: "production",
    PORT: "4321",
    MANUAL_STORAGE: "supabase",
    MANUAL_BUNDLE_PATH: "D:/private/manuals.bundle",
  });
  assert.equal(config.production, true);
  assert.equal(config.port, 4321);
  assert.equal(config.manualStorage, "supabase");
  assert.equal(config.manualBundleFile, path.resolve("D:/private/manuals.bundle"));
  assert.throws(() => loadAppConfig({ MANUAL_STORAGE: "public" }), /MANUAL_STORAGE/);
});

test("finds Hostinger manual files beside the recovered database", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "kks-config-"));
  try {
    const dataDirectory = path.join(root, "public_html", "private-data", "recovered");
    mkdirSync(dataDirectory, { recursive: true });
    writeFileSync(path.join(root, "public_html", "private-data", "manuals-index.json"), "{}");

    const config = loadAppConfig({ DATA_DIR: dataDirectory }, path.join(root, "node-build"));
    assert.equal(config.manualIndexFile, path.join(root, "public_html", "private-data", "manuals-index.json"));
    assert.equal(config.manualBundleFile, path.join(root, "public_html", "private-data", "manuals.bundle"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("finds Hostinger public data from a versioned hbuild directory", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "kks-hbuild-"));
  try {
    const hostname = "example.hostingersite.com";
    const privateDirectory = path.join(root, "domains", hostname, "public_html", "private-data");
    mkdirSync(privateDirectory, { recursive: true });
    writeFileSync(path.join(privateDirectory, "manuals-index.json"), "{}");

    const workingDirectory = path.join(root, "hbuilds", "current", "nodejs");
    const config = loadAppConfig({ PUBLIC_ORIGIN: `https://${hostname}` }, workingDirectory);
    assert.equal(config.manualIndexFile, path.join(privateDirectory, "manuals-index.json"));
    assert.equal(config.manualBundleFile, path.join(privateDirectory, "manuals.bundle"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
