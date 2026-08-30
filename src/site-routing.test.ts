import assert from "node:assert/strict";
import test from "node:test";
import { isApplicationPath, isAppHostname, isPublicContentPath, isPublicHostname, splitSiteRedirect } from "./site-routing.js";

const origins = { publicOrigin: "https://supercardocs.com", appOrigin: "https://app.supercardocs.com" };

test("public application paths redirect to the app subdomain", () => {
  assert.equal(splitSiteRedirect({ ...origins, hostname: "supercardocs.com", method: "GET", originalUrl: "/login?next=%2Fvehicles" }), "https://app.supercardocs.com/login?next=%2Fvehicles");
  assert.equal(splitSiteRedirect({ ...origins, hostname: "supercardocs.com", method: "GET", originalUrl: "/modern-manuals/index.html" }), "https://app.supercardocs.com/modern-manuals/index.html");
});

test("app legal links return to the public site without redirecting writes", () => {
  assert.equal(splitSiteRedirect({ ...origins, hostname: "app.supercardocs.com", method: "GET", originalUrl: "/privacy" }), "https://supercardocs.com/privacy");
  assert.equal(splitSiteRedirect({ ...origins, hostname: "app.supercardocs.com", method: "POST", originalUrl: "/contact" }), null);
  assert.equal(isAppHostname("app.supercardocs.com", origins.appOrigin, origins.publicOrigin), true);
  assert.equal(isPublicHostname("supercardocs.com", origins.publicOrigin, origins.appOrigin), true);
  assert.equal(isApplicationPath("/admin/members"), true);
  assert.equal(isApplicationPath("/internal/seo/auto-publish"), true);
  assert.equal(isPublicContentPath("/contact"), true);
  assert.equal(isPublicContentPath("/guides/mclaren-example"), true);
  assert.equal(isPublicContentPath("/tools/workshop-unit-converter"), true);
});

test("combined and local deployments keep current routes", () => {
  assert.equal(splitSiteRedirect({ hostname: "localhost", method: "GET", originalUrl: "/login", publicOrigin: "http://localhost:3000", appOrigin: "http://localhost:3000" }), null);
});
