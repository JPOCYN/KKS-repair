import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDirectory = mkdtempSync(path.join(os.tmpdir(), "kks-modern-reader-"));
const port = 38419;
const baseUrl = `http://127.0.0.1:${port}`;
const adminEmail = "reader-flow@example.com";
const adminPassword = "reader-flow-test-password";
const mergedIndex = path.resolve("private-transfer/manuals-index-modern.json");
const server = spawn(process.execPath, ["dist/start.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    DATA_DIR: dataDirectory,
    ADMIN_EMAIL: adminEmail,
    ADMIN_PASSWORD: adminPassword,
    PUBLIC_ORIGIN: baseUrl,
    MANUALS_DIR: path.resolve("manuals"),
    MANUAL_BUNDLE_PATH: path.resolve("private-transfer/manuals.bundle"),
    MANUAL_INDEX_PATH: mergedIndex,
    MODERN_MANUALS_DIR: path.resolve("modern-manuals"),
    MANUAL_REMOTE_BASE_URL: "",
    MANUAL_REMOTE_TOKEN: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (value) => { serverOutput += value; });
server.stderr.on("data", (value) => { serverOutput += value; });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Local server did not start:\n${serverOutput}`);
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, { redirect: "manual", ...options });
}

async function login() {
  const response = await request("/login", {
    method: "POST",
    headers: { Origin: baseUrl, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: adminEmail, password: adminPassword }),
  });
  assert(response.status === 302 && response.headers.get("location") === "/admin", "Admin login failed");
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie, "Session cookie is missing");
  return cookie;
}

function decodedAttribute(value) {
  return value.replaceAll("&amp;", "&");
}

try {
  const health = await waitForServer();
  assert(health.status === "ok" && health.database === "connected", "Database health failed");
  assert(health.manuals?.ready === true && health.manuals?.indexedFiles === 107176, "Merged manual store health failed");
  assert(health.modernReader?.ready === true, "Modern reader health failed");

  for (const pathname of [
    "/modern-manuals/index.html",
    "/modern-manuals/catalog.json",
    "/manuals/pdfs/McLaren-SIS-SPEEDTAIL-Coupe/Repair/graphics/en/0502.pdf",
  ]) {
    const response = await request(pathname);
    assert(response.status === 302 && response.headers.get("location") === "/login", `Unauthenticated request was not blocked: ${pathname}`);
  }

  const cookie = await login();
  const authenticatedHeaders = { Cookie: cookie };
  const reader = await request("/modern-manuals/index.html?manual=McLaren-SIS-SPEEDTAIL-Coupe&page=Repair%2F21001.html", { headers: authenticatedHeaders });
  const readerHtml = await reader.text();
  assert(reader.status === 200 && readerHtml.includes("Supercar Docs manual reader"), "Modern reader HTML failed");
  assert(readerHtml.includes("Independent content notice"), "Reader disclaimer is missing");
  assert(readerHtml.includes("reader.css?v=20260830-1"), "Reader stylesheet cache revision is missing");
  assert(readerHtml.includes("reader.js?v=20260830-1"), "Reader script cache revision is missing");
  assert(readerHtml.includes('href="/" aria-label="Return to dashboard"'), "Reader logo does not return through the dashboard route");
  assert(readerHtml.includes('id="procedureTabs"'), "Procedure information tabs are missing");
  assert(!readerHtml.includes("copyLinkButton"), "Copy-link control should not be rendered");
  assert(readerHtml.includes('id="textScaleValue"'), "Visible text-scale status is missing");

  const readerCss = await (await request("/modern-manuals/reader.css?v=20260830-1", { headers: authenticatedHeaders })).text();
  assert(readerCss.includes(".reader-state[hidden] { display: none; }"), "Completed loading state is not hidden");
  assert(readerCss.includes(".procedure-tabs[hidden] { display: none; }"), "Procedure tabs hidden state is missing");
  assert(readerCss.includes("position: static !important"), "Legacy absolute-positioned tables are not normalized");
  assert(readerCss.includes('[style*="font-size" i]'), "Legacy fixed font sizes are not normalized");

  const readerScript = await (await request("/modern-manuals/reader.js?v=20260830-1", { headers: authenticatedHeaders })).text();
  assert(readerScript.includes("renderProcedureTabs(sourceDocument, pageUrl)"), "Procedure tab rendering is missing");
  assert(readerScript.includes("changeTextScale(.1)"), "Text-size controls do not use the visible scale step");
  assert(readerScript.includes("option.textContent = manual.name"), "Vehicle selector still appends document-count numbers");

  const catalogue = await request("/vehicles", { headers: authenticatedHeaders });
  const catalogueHtml = await catalogue.text();
  const vehicleIds = [...catalogueHtml.matchAll(/href="\/vehicles\/(\d+)"/g)].map((match) => match[1]);
  assert(vehicleIds.length === 21 && new Set(vehicleIds).size === 21, `Expected 21 visible vehicles, received ${vehicleIds.length}`);
  const checkedManuals = new Set();
  for (const id of vehicleIds) {
    const detail = await request(`/vehicles/${id}`, { headers: authenticatedHeaders });
    const html = await detail.text();
    assert(detail.status === 200, `Vehicle ${id} failed`);
    const readerHref = html.match(/href="(\/modern-manuals\/index\.html\?manual=[^"]+&amp;page=[^"]+)"/)?.[1];
    assert(readerHref, `Vehicle ${id} is missing its modern manual link`);
    assert(html.includes("Start reading"), `Vehicle ${id} is missing the simplified reader action`);
    assert(!html.includes("Legacy fallback"), `Vehicle ${id} still exposes the legacy fallback link`);
    const readerUrl = new URL(decodedAttribute(readerHref), baseUrl);
    const manual = readerUrl.searchParams.get("manual");
    const page = readerUrl.searchParams.get("page");
    assert(manual && page, `Vehicle ${id} modern reader URL is incomplete`);
    checkedManuals.add(manual);
    const legacyHref = `/manuals/${encodeURIComponent(manual)}/html/${page.split("/").map(encodeURIComponent).join("/")}`;
    const source = await request(legacyHref, { headers: authenticatedHeaders });
    assert(source.status === 200, `Vehicle ${id} first legacy document failed`);
  }
  assert(checkedManuals.size === 16, `Expected 16 unique manual folders, received ${checkedManuals.size}`);

  const pdfChecks = [
    { path: "/manuals/pdfs/McLaren-SIS-SPEEDTAIL-Coupe/Repair/graphics/en/0502.pdf", bytes: 13139 },
    { path: "/manuals/pdfs/McLaren-SIS-750S-Coupe/Repair/graphics/en/2588.pdf", bytes: 53301840 },
  ];
  for (const sample of pdfChecks) {
    const response = await request(sample.path, { headers: { ...authenticatedHeaders, Range: "bytes=0-1023" } });
    const body = new Uint8Array(await response.arrayBuffer());
    assert(response.status === 206, `PDF range failed: ${sample.path}`);
    assert(response.headers.get("content-type") === "application/pdf", `PDF content type failed: ${sample.path}`);
    assert(response.headers.get("content-range") === `bytes 0-1023/${sample.bytes}`, `PDF content range failed: ${sample.path}`);
    assert(body.length === 1024 && new TextDecoder().decode(body.subarray(0, 5)) === "%PDF-", `PDF body failed: ${sample.path}`);
  }

  console.log(JSON.stringify({
    passed: true,
    vehicles: vehicleIds.length,
    manualFolders: checkedManuals.size,
    indexedFiles: health.manuals.indexedFiles,
    pdfs: pdfChecks,
    checks: [
      "database-and-manual-health",
      "unauthenticated-reader-and-pdfs-blocked",
      "authenticated-reader-assets",
      "completed-loading-state-hidden",
      "procedure-information-tabs",
      "compact-procedure-table-layout",
      "document-text-scaling",
      "all-visible-vehicles",
      "legacy-fallbacks",
      "small-pdf-range",
      "large-pdf-range",
      "pdf-content-type",
    ],
  }, null, 2));
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  rmSync(dataDirectory, { recursive: true, force: true });
}
