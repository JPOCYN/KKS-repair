import assert from "node:assert/strict";
import test from "node:test";
import { supabaseStorageObjectUrl } from "./supabase-manuals.js";

test("private manual object URLs encode each safe path segment", () => {
  assert.equal(
    supabaseStorageObjectUrl("https://project.supabase.co/ignored", "manuals", "/BMW 1/html/Repair/a+b.html"),
    "https://project.supabase.co/storage/v1/object/manuals/BMW%201/html/Repair/a%2Bb.html",
  );
  assert.throws(() => supabaseStorageObjectUrl("https://project.supabase.co", "manuals", "../secret"), /invalid/);
  assert.throws(() => supabaseStorageObjectUrl("https://project.supabase.co", "invalid bucket", "safe.html"), /invalid/);
});
