import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDirectory = mkdtempSync(path.join(os.tmpdir(), "kks-admin-flow-"));
const port = 38417;
const baseUrl = `http://127.0.0.1:${port}`;
const adminEmail = "admin-flow@example.com";
const adminPassword = "admin-flow-test-password";
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Local server did not start:\n${serverOutput}`);
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, { redirect: "manual", ...options });
}

async function form(pathname, cookie, values) {
  return request(pathname, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: baseUrl,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
  });
}

try {
  await waitForServer();
  const landing = await request("/");
  const landingHtml = await landing.text();
  assert(landing.status === 200, "Landing page failed");
  assert(landingHtml.includes("FAQPage") && landingHtml.includes("Independent content notice"), "Landing SEO or disclaimer is missing");
  assert((await request("/robots.txt")).status === 200, "robots.txt failed");
  assert((await request("/sitemap.xml")).status === 200, "sitemap.xml failed");
  const privateReader = await request("/modern-manuals/index.html");
  assert(privateReader.status === 302 && privateReader.headers.get("location") === "/login", "Modern reader is not protected");

  const login = await form("/login", "", { email: adminEmail, password: adminPassword });
  assert(login.status === 302 && login.headers.get("location") === "/admin", "Admin login failed");
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert(cookie, "Admin session cookie is missing");
  const dashboard = await request("/admin", { headers: { Cookie: cookie } });
  const dashboardHtml = await dashboard.text();
  const csrf = dashboardHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert(dashboard.status === 200 && csrf, "Admin dashboard or CSRF token failed");
  const reader = await request("/modern-manuals/index.html", { headers: { Cookie: cookie } });
  const readerHtml = await reader.text();
  const readerScript = await (await request("/modern-manuals/reader.js", { headers: { Cookie: cookie } })).text();
  const readerCatalog = await request("/modern-manuals/catalog.json", { headers: { Cookie: cookie } });
  assert(reader.status === 200 && readerHtml.includes("Supercar Docs manual reader"), "Authenticated modern reader failed");
  assert(readerCatalog.status === 200, "Authenticated modern reader catalog failed");
  assert(readerScript.includes("new URL(`pdfs/${path}`, manualsBaseUrl())"), "PDF URLs do not use the protected manual endpoint");

  const codeCreated = await form("/admin/codes", cookie, {
    _csrf: csrf,
    code: "ADMINFLOWTEST",
    durationHours: "720",
    status: "1",
  });
  assert(codeCreated.status === 302, "Authorization code creation failed");
  const codesHtml = await (await request("/admin/codes", { headers: { Cookie: cookie } })).text();
  const codeId = codesHtml.match(/ADMINFLOWTEST[\s\S]*?\/admin\/codes\/(\d+)\/edit/)?.[1];
  assert(codeId, "Created authorization code was not listed");
  const codeUpdated = await form(`/admin/codes/${codeId}`, cookie, {
    _csrf: csrf,
    code: "ADMINFLOWTEST",
    durationHours: "2160",
    status: "1",
  });
  assert(codeUpdated.status === 302, "Authorization code update failed");

  const memberCreated = await form("/admin/members", cookie, {
    _csrf: csrf,
    email: "admin-flow-customer@example.com",
    name: "Admin Flow Customer",
    contactAddress: "",
    password: "customer-flow-password",
    vipExpiresAt: "",
    status: "1",
    vipStatus: "1",
  });
  assert(memberCreated.status === 302, "Member creation failed");
  const membersHtml = await (await request("/admin/members", { headers: { Cookie: cookie } })).text();
  const memberId = membersHtml.match(/admin-flow-customer@example\.com[\s\S]*?\/admin\/members\/(\d+)\/edit/)?.[1];
  assert(memberId, "Created member was not listed");
  const memberExtended = await form(`/admin/members/${memberId}/extend`, cookie, { _csrf: csrf, days: "30" });
  assert(memberExtended.status === 302 && memberExtended.headers.get("location") === "/admin/members?extended=1", "Member extension failed");
  const memberEdit = await (await request(`/admin/members/${memberId}/edit`, { headers: { Cookie: cookie } })).text();
  const expiry = memberEdit.match(/name="vipExpiresAt" type="date" value="([^"]+)"/)?.[1];
  assert(expiry && new Date(expiry).valueOf() > Date.now() + 28 * 24 * 60 * 60 * 1000, "Member expiry was not extended");
  const memberUpdated = await form(`/admin/members/${memberId}`, cookie, {
    _csrf: csrf,
    email: "admin-flow-customer@example.com",
    name: "Updated Admin Flow Customer",
    contactAddress: "Workshop",
    password: "",
    vipExpiresAt: expiry,
    status: "1",
    vipStatus: "1",
  });
  assert(memberUpdated.status === 302, "Member update failed");

  const vehicleCreated = await form("/admin/vehicles", cookie, {
    _csrf: csrf,
    brandId: "1",
    code: "ADMINFLOW",
    name: "Admin Flow Vehicle",
    imagePath: "",
    synopsis: "Local administration workflow test.",
    folderName: "AdminFlowVehicle",
    menuType: "",
    manualId: "",
    sort: "999999",
    isShow: "1",
  });
  assert(vehicleCreated.status === 302, "Vehicle creation failed");
  const vehiclesHtml = await (await request("/admin/vehicles", { headers: { Cookie: cookie } })).text();
  const vehicleId = vehiclesHtml.match(/ADMINFLOW[\s\S]*?\/admin\/vehicles\/(\d+)\/edit/)?.[1];
  assert(vehicleId, "Created vehicle was not listed");
  const vehicleUpdated = await form(`/admin/vehicles/${vehicleId}`, cookie, {
    _csrf: csrf,
    brandId: "1",
    code: "ADMINFLOW",
    name: "Updated Admin Flow Vehicle",
    imagePath: "",
    synopsis: "Updated local administration workflow test.",
    folderName: "AdminFlowVehicle",
    menuType: "",
    manualId: "",
    sort: "999999",
    isShow: "1",
  });
  assert(vehicleUpdated.status === 302, "Vehicle update failed");

  console.log(JSON.stringify({
    passed: true,
    checks: [
      "landing-seo",
      "site-disclaimer",
      "robots-and-sitemap",
      "admin-login",
      "admin-dashboard",
      "protected-modern-reader",
      "code-create-and-update",
      "member-create-update-and-extend",
      "vehicle-create-and-update",
    ],
  }, null, 2));
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  rmSync(dataDirectory, { recursive: true, force: true });
}
