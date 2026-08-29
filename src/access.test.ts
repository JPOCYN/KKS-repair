import assert from "node:assert/strict";
import test from "node:test";
import { hasLibraryAccess, libraryAccessState } from "./access.js";

const now = Date.parse("2026-08-29T12:00:00.000Z");

test("administrators always have library access", () => {
  assert.equal(hasLibraryAccess({ role: "admin", vipStatus: false, vipExpiresAt: "2020-01-01" }, now), true);
});

test("customer library access is independent from the enabled account session", () => {
  assert.equal(libraryAccessState({ role: "customer", vipStatus: false, vipExpiresAt: null }, now), "inactive");
  assert.equal(libraryAccessState({ role: "customer", vipStatus: true, vipExpiresAt: "2020-01-01" }, now), "expired");
  assert.equal(libraryAccessState({ role: "customer", vipStatus: true, vipExpiresAt: "2026-08-29" }, now), "active");
  assert.equal(libraryAccessState({ role: "customer", vipStatus: true, vipExpiresAt: null }, now), "active");
});
