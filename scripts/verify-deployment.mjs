const requiredEnvironment = [
  "VERIFY_BASE_URL",
  "VERIFY_CUSTOMER_EMAIL",
  "VERIFY_CUSTOMER_PASSWORD",
  "VERIFY_ADMIN_EMAIL",
  "VERIFY_ADMIN_PASSWORD",
];

for (const name of requiredEnvironment) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required`);
}

const baseUrl = new URL(process.env.VERIFY_BASE_URL);
if (!/^https?:$/.test(baseUrl.protocol)) throw new Error("VERIFY_BASE_URL must use HTTP or HTTPS");
baseUrl.pathname = "/";
baseUrl.search = "";
baseUrl.hash = "";

const manualPaths = process.argv
  .filter((value) => value.startsWith("--manual="))
  .map((value) => value.slice("--manual=".length))
  .filter(Boolean);

if (manualPaths.length === 0) {
  manualPaths.push("McLaren-SIS-12C-650S-620C-Coupe/html/Repair/11111-1.html");
}

function requestUrl(pathname) {
  return new URL(pathname.replace(/^\/+/, ""), baseUrl);
}

async function request(pathname, options = {}) {
  return fetch(requestUrl(pathname), { redirect: "manual", ...options });
}

async function expectStatus(label, response, expected) {
  if (!expected.includes(response.status)) {
    const body = (await response.text()).slice(0, 300);
    throw new Error(`${label}: expected ${expected.join("/")}, received ${response.status}: ${body}`);
  }
}

async function login(email, password, expectedLocation) {
  const response = await request("/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: baseUrl.origin,
    },
    body: new URLSearchParams({ email, password }),
  });
  await expectStatus(`Login for ${email}`, response, [302, 303]);
  if (response.headers.get("location") !== expectedLocation) {
    throw new Error(`Login for ${email}: unexpected redirect ${response.headers.get("location")}`);
  }
  const cookie = response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie");
  if (!cookie) throw new Error(`Login for ${email}: session cookie was not set`);
  return cookie.split(";", 1)[0];
}

const health = await request("/health");
await expectStatus("Health check", health, [200]);
const healthBody = await health.json();
if (healthBody.status !== "ok" || healthBody.database !== "connected") {
  throw new Error(`Health check returned an unhealthy body: ${JSON.stringify(healthBody)}`);
}

const directIndex = await request("/private-data/manuals-index.json");
await expectStatus("Private manual index", directIndex, [403, 404]);

const unauthenticatedManual = await request(`/manuals/${manualPaths[0]}`);
await expectStatus("Unauthenticated manual", unauthenticatedManual, [302, 303]);
if (unauthenticatedManual.headers.get("location") !== "/login") {
  throw new Error("Unauthenticated manual did not redirect to /login");
}

const customerCookie = await login(
  process.env.VERIFY_CUSTOMER_EMAIL,
  process.env.VERIFY_CUSTOMER_PASSWORD,
  "/vehicles",
);
const vehicles = await request("/vehicles", { headers: { Cookie: customerCookie } });
await expectStatus("Customer vehicle catalogue", vehicles, [200]);

const manualResults = [];
for (const manualPath of manualPaths) {
  const response = await request(`/manuals/${manualPath}`, {
    headers: { Cookie: customerCookie, Range: "bytes=0-1023" },
  });
  await expectStatus(`Manual ${manualPath}`, response, [200, 206]);
  const bytes = (await response.arrayBuffer()).byteLength;
  if (bytes === 0) throw new Error(`Manual ${manualPath}: empty response`);
  manualResults.push({ path: manualPath, status: response.status, bytes });
}

const adminCookie = await login(
  process.env.VERIFY_ADMIN_EMAIL,
  process.env.VERIFY_ADMIN_PASSWORD,
  "/admin",
);
for (const pathname of ["/admin", "/admin/vehicles", "/admin/members", "/admin/codes"]) {
  const response = await request(pathname, { headers: { Cookie: adminCookie } });
  await expectStatus(`Admin page ${pathname}`, response, [200]);
}

console.log(JSON.stringify({
  passed: true,
  baseUrl: baseUrl.origin,
  backend: healthBody.backend,
  manuals: manualResults,
  checks: ["health", "private-files", "customer-login", "customer-catalogue", "manuals", "admin-login", "admin-pages"],
}, null, 2));
