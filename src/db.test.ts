import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRecoveredActiveFlag } from "./db.js";

test("legacy enabled flags are converted to the replacement convention", () => {
  assert.equal(normalizeRecoveredActiveFlag(0), 1);
  assert.equal(normalizeRecoveredActiveFlag("0"), 1);
  assert.equal(normalizeRecoveredActiveFlag(1), 0);
});
