import assert from "node:assert/strict";
import test from "node:test";
import { normalizeManualPath, parseByteRange } from "./manual-bundle.js";

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
