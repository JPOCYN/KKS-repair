import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedWriteOrigin } from "./origin.js";

test("allows an explicitly configured origin", () => {
  assert.equal(isAllowedWriteOrigin({
    production: true,
    configuredOrigins: "https://kks-repair.com, https://preview.example.com",
    requestOrigin: "https://preview.example.com",
    fetchSite: "same-origin",
  }), true);
});

test("allows an opaque origin only for a browser-verified same-origin request", () => {
  assert.equal(isAllowedWriteOrigin({
    production: true,
    configuredOrigins: "https://preview.example.com",
    requestOrigin: "null",
    fetchSite: "same-origin",
  }), true);

  assert.equal(isAllowedWriteOrigin({
    production: true,
    configuredOrigins: "https://preview.example.com",
    requestOrigin: "null",
    fetchSite: "cross-site",
  }), false);
});

test("allows an opaque origin with an allowed referer when a proxy removes fetch metadata", () => {
  assert.equal(isAllowedWriteOrigin({
    production: true,
    configuredOrigins: "https://preview.example.com",
    requestOrigin: "null",
    requestReferer: "https://preview.example.com/login",
  }), true);

  assert.equal(isAllowedWriteOrigin({
    production: true,
    configuredOrigins: "https://preview.example.com",
    requestOrigin: "null",
    requestReferer: "https://attacker.example/login",
  }), false);

  assert.equal(isAllowedWriteOrigin({
    production: true,
    configuredOrigins: "https://preview.example.com",
    requestOrigin: "null",
    fetchSite: "cross-site",
    requestReferer: "https://preview.example.com/login",
  }), false);
});

test("allows an opaque origin when the hosting proxy removes both browser proof headers", () => {
  assert.equal(isAllowedWriteOrigin({
    production: true,
    configuredOrigins: "https://preview.example.com",
    requestOrigin: "null",
  }), true);
});

test("rejects any other unconfigured production origin", () => {
  assert.equal(isAllowedWriteOrigin({
    production: true,
    configuredOrigins: "https://preview.example.com",
    requestOrigin: "https://attacker.example",
    fetchSite: "same-origin",
  }), false);
});

test("preserves development and non-browser client behavior", () => {
  assert.equal(isAllowedWriteOrigin({
    production: false,
    configuredOrigins: "https://preview.example.com",
    requestOrigin: "https://attacker.example",
  }), true);

  assert.equal(isAllowedWriteOrigin({
    production: true,
    configuredOrigins: "https://preview.example.com",
  }), true);
});
