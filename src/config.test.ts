import assert from "node:assert/strict";
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
