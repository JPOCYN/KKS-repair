import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import { loadAppConfig } from "./config.js";
import type { SessionUser } from "./db.js";
import { hasLibraryAccess, type LibraryAccessUser } from "./access.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createManualStorageHandler } from "./manual-storage.js";
import { isAllowedWriteOrigin } from "./origin.js";
import { isApplicationPath, isAppHostname, isPublicContentPath, isPublicHostname, splitSiteRedirect } from "./site-routing.js";
import {
  createAppRepository,
  type CodeInput,
  type MemberInput,
  type VehicleInput,
} from "./repository.js";
import {
  adminCodeFormView,
  adminCodesView,
  adminContactRequestsView,
  adminMemberFormView,
  adminMembersView,
  adminVehicleFormView,
  adminVehiclesView,
  adminView,
  accessStatusView,
  contactView,
  landingView,
  loginView,
  privacyView,
  registerView,
  termsView,
  vehicleDetailView,
  vehicleListView,
} from "./views.js";

const app = express();
const config = loadAppConfig();
const repository = await createAppRepository();
const publicSiteOrigin = (() => {
  const configured = config.publicOrigin;
  try {
    return new URL(configured || "http://localhost:3000").origin;
  } catch {
    return "http://localhost:3000";
  }
})();
const appSiteOrigin = (() => {
  try {
    return new URL(config.appOrigin || publicSiteOrigin).origin;
  } catch {
    return publicSiteOrigin;
  }
})();
if (config.production) app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'", "blob:"],
      imgSrc: ["'self'", "data:", "blob:"],
      objectSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  next();
});
app.use((req, res, next) => {
  if (config.production) {
    const canonicalHost = new URL(publicSiteOrigin).hostname.toLowerCase();
    if (req.hostname.toLowerCase() === `www.${canonicalHost}`) {
      res.redirect(301, new URL(req.originalUrl, publicSiteOrigin).toString());
      return;
    }
  }
  next();
});
app.use((req, res, next) => {
  const destination = splitSiteRedirect({
    hostname: req.hostname,
    method: req.method,
    originalUrl: req.originalUrl,
    publicOrigin: publicSiteOrigin,
    appOrigin: appSiteOrigin,
  });
  if (destination) {
    res.redirect(302, destination);
    return;
  }
  if ((isPublicHostname(req.hostname, publicSiteOrigin, appSiteOrigin) && isApplicationPath(req.path))
    || (isAppHostname(req.hostname, appSiteOrigin, publicSiteOrigin) && isPublicContentPath(req.path))) {
    res.status(404).send("Not found");
    return;
  }
  next();
});
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(express.json({ limit: "64kb" }));
app.use(express.static(config.publicDirectory, { maxAge: config.production ? "7d" : 0 }));

type AuthenticatedRequest = Request & { sessionUser?: SessionUser; sessionToken?: string };

function destinationFor(user: LibraryAccessUser): string {
  if (user.role === "admin") return "/admin";
  return hasLibraryAccess(user) ? "/vehicles" : "/access";
}

function sessionCookie(token: string, maxAge = 43200): string {
  const cookie = [`kks_session=${encodeURIComponent(token)}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
  if (config.production) cookie.push("Secure");
  return cookie.join("; ");
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of (header || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    try {
      result[item.slice(0, separator).trim()] = decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      // Ignore one malformed cookie instead of failing the entire request.
    }
  }
  return result;
}

async function sessionMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = parseCookies(req.headers.cookie).kks_session;
    req.sessionToken = token;
    req.sessionUser = await repository.getSessionUser(token) || undefined;
    next();
  } catch (error) {
    next(error);
  }
}

async function recoveredDatabaseMiddleware(_req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    await repository.checkRecoveredDatabase();
    next();
  } catch (error) {
    next(error);
  }
}

function requireUser(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.sessionUser) {
    res.redirect("/login");
    return;
  }
  next();
}

function requireLibraryAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.sessionUser) {
    res.redirect("/login");
    return;
  }
  if (!hasLibraryAccess(req.sessionUser)) {
    res.redirect("/access");
    return;
  }
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.sessionUser) {
    res.redirect("/login");
    return;
  }
  if (req.sessionUser.role !== "admin") {
    res.status(403).send("Forbidden");
    return;
  }
  next();
}

function requireCsrf(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.sessionUser || req.body?._csrf !== req.sessionUser.csrfToken) {
    res.status(403).send("Invalid request token");
    return;
  }
  next();
}

app.use(recoveredDatabaseMiddleware);
app.use(sessionMiddleware);
app.use("/modern-manuals/pdfs", requireLibraryAccess, (_req, res) => res.status(404).send("Manual file not found"));
app.use("/modern-manuals", requireLibraryAccess, express.static(config.modernManualsDirectory, {
  fallthrough: true,
  index: "index.html",
  maxAge: config.production ? "7d" : 0,
}), (_req, res) => res.status(404).send("Reader file not found"));
app.use("/manuals", requireLibraryAccess, await createManualStorageHandler(config));
app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (!isAllowedWriteOrigin({
    production: config.production,
    configuredOrigins: config.configuredOrigins,
    requestOrigin: req.get("origin"),
    fetchSite: req.get("sec-fetch-site"),
    requestReferer: req.get("referer"),
  })) {
    res.status(403).send("Origin not allowed");
    return;
  }
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
const registerSchema = z.object({
  email: z.email().max(254),
  authCode: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(200),
  acceptPolicies: z.literal("yes"),
});
const contactSchema = z.object({
  requestType: z.enum(["general", "privacy", "copyright"]),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  message: z.string().trim().min(10).max(5000),
  confirmAccuracy: z.literal("yes"),
  website: z.string().max(200).optional().default(""),
});
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

function manualHealth(): Record<string, unknown> {
  if (config.manualStorage !== "local") return { storage: config.manualStorage, ready: true };
  if (config.manualRemoteBaseUrl && config.manualRemoteToken) return { storage: "private-http", ready: true };
  if (!existsSync(config.manualIndexFile)) return { storage: "local", ready: false, reason: "index-missing" };
  try {
    const index = JSON.parse(readFileSync(config.manualIndexFile, "utf8")) as {
      version?: number;
      parts?: Array<{ file: string; length: number }>;
      files?: Record<string, unknown>;
    };
    const parts = index.version === 2 && Array.isArray(index.parts) ? index.parts : [];
    const validParts = parts.filter((part) => {
      if (!/^[A-Za-z0-9._-]+$/.test(part.file) || !Number.isSafeInteger(part.length)) return false;
      const file = path.join(path.dirname(config.manualIndexFile), part.file);
      return existsSync(file) && statSync(file).size === part.length;
    }).length;
    return {
      storage: "local",
      ready: index.version === 1 ? existsSync(config.manualBundleFile) : parts.length > 0 && validParts === parts.length,
      version: index.version,
      indexedFiles: index.files ? Object.keys(index.files).length : 0,
      parts: parts.length,
      validParts,
    };
  } catch {
    return { storage: "local", ready: false, reason: "index-invalid" };
  }
}

app.get("/health", async (_req, res) => {
  try {
    await repository.health();
    const readerFiles = ["index.html", "reader.css", "reader.js", "catalog.json"];
    const readerReady = readerFiles.every((file) => existsSync(path.join(config.modernManualsDirectory, file)));
    res.json({ status: "ok", database: "connected", backend: repository.backend, manuals: manualHealth(), modernReader: { ready: readerReady } });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable", backend: repository.backend });
  }
});

app.get("/robots.txt", (req, res) => {
  if (isAppHostname(req.hostname, appSiteOrigin, publicSiteOrigin)) {
    res.type("text/plain").send("User-agent: *\nDisallow: /\n");
    return;
  }
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /vehicles\nDisallow: /manuals\nDisallow: /modern-manuals\nDisallow: /login\nDisallow: /register\nSitemap: ${publicSiteOrigin}/sitemap.xml\n`);
});

app.get("/sitemap.xml", (_req, res) => {
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${publicSiteOrigin}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>`);
});

app.get("/login", (req: AuthenticatedRequest, res) => {
  if (req.sessionUser) return res.redirect(destinationFor(req.sessionUser));
  res.send(loginView());
});

app.get("/register", (req: AuthenticatedRequest, res) => {
  if (req.sessionUser) return res.redirect(destinationFor(req.sessionUser));
  res.send(registerView());
});

app.get("/privacy", (_req, res) => res.send(privacyView(publicSiteOrigin)));
app.get("/terms", (_req, res) => res.send(termsView(publicSiteOrigin)));
app.get("/contact", (_req, res) => res.send(contactView(publicSiteOrigin)));
app.post("/contact", contactLimiter, async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).send(contactView(publicSiteOrigin, { error: "Complete all required fields and provide at least 10 characters of detail.", values: req.body }));
    return;
  }
  if (!parsed.data.website) {
    await repository.createContactRequest({
      name: parsed.data.name,
      email: parsed.data.email,
      requestType: parsed.data.requestType,
      message: parsed.data.message,
    });
  }
  res.status(201).send(contactView(publicSiteOrigin, { sent: true }));
});

app.post("/register", loginLimiter, async (req: AuthenticatedRequest, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send(registerView("Enter a valid email and authorization code, use a password of at least 10 characters, and accept the Terms and Privacy Statement.", req.body));

  try {
    const userId = await repository.registerCustomer({
      email: parsed.data.email,
      name: parsed.data.email,
      authCode: parsed.data.authCode,
      passwordHash: hashPassword(parsed.data.password),
    });
    if (!userId) return res.status(400).send(registerView("That authorization code is invalid, disabled, or already used.", req.body));
    const session = await repository.createSession(userId);
    res.setHeader("Set-Cookie", sessionCookie(session.token));
    res.redirect("/vehicles");
  } catch {
    res.status(409).send(registerView("That email address is already registered.", req.body));
  }
});

app.post("/login", loginLimiter, async (req: AuthenticatedRequest, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send(loginView("Enter a valid email and password."));
  const user = await repository.findLoginUser(parsed.data.email);
  if (!user || !user.status || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return res.status(401).send(loginView("Email or password is incorrect."));
  }
  const session = await repository.createSession(user.id);
  res.setHeader("Set-Cookie", sessionCookie(session.token));
  res.redirect(destinationFor(user));
});

app.post("/logout", requireUser, requireCsrf, async (req: AuthenticatedRequest, res) => {
  await repository.deleteSession(req.sessionToken);
  res.setHeader("Set-Cookie", sessionCookie("", 0));
  res.redirect("/login");
});

app.get("/", (req: AuthenticatedRequest, res) => {
  if (isAppHostname(req.hostname, appSiteOrigin, publicSiteOrigin)) {
    res.redirect(req.sessionUser ? destinationFor(req.sessionUser) : "/login");
    return;
  }
  res.send(landingView(req.sessionUser, publicSiteOrigin, appSiteOrigin));
});

app.get("/access", requireUser, (req: AuthenticatedRequest, res) => {
  if (req.sessionUser!.role === "admin") return res.redirect("/admin");
  res.send(accessStatusView(req.sessionUser!));
});

app.get("/vehicles", requireLibraryAccess, async (req: AuthenticatedRequest, res) => {
  const cars = await repository.listVisibleVehicles();
  res.send(vehicleListView(req.sessionUser!, cars));
});

app.get("/vehicles/:id", requireLibraryAccess, async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).send("Not found");
  const detail = await repository.getVehicleDetail(id);
  if (!detail) return res.status(404).send("Not found");
  res.send(vehicleDetailView(req.sessionUser!, detail.car, detail.menu));
});

app.get("/admin", requireAdmin, async (req: AuthenticatedRequest, res) => {
  res.send(adminView(req.sessionUser!, await repository.getDashboard()));
});

app.get("/admin/requests", requireAdmin, async (req: AuthenticatedRequest, res) => {
  res.send(adminContactRequestsView(req.sessionUser!, await repository.listContactRequests(), req.query.updated === "1"));
});

app.post("/admin/requests/:id/resolve", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).send("Not found");
  const updated = await repository.resolveContactRequest(id);
  if (!updated) return res.status(404).send("Not found");
  res.redirect("/admin/requests?updated=1");
});

const vehicleSchema = z.object({
  brandId: z.coerce.number().int().positive(),
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  imagePath: z.string().trim().max(500),
  synopsis: z.string().trim().max(5000),
  folderName: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/),
  menuType: z.string().trim().max(100),
  manualId: z.union([z.literal(""), z.coerce.number().int()]),
  sort: z.coerce.number().int(),
  isShow: z.string().optional(),
});
const memberSchema = z.object({
  email: z.email().max(254),
  contactAddress: z.string().trim().max(500),
  password: z.string().max(200),
  vipExpiresAt: z.union([z.literal(""), z.iso.date()]),
  status: z.string().optional(),
  vipStatus: z.string().optional(),
});
const memberExtensionSchema = z.object({ days: z.coerce.number().int().min(1).max(3650) });
const vehicleVisibilitySchema = z.object({ visible: z.enum(["0", "1"]) });
const codeSchema = z.object({
  code: z.string().trim().max(100).regex(/^$|^[A-Za-z0-9_-]+$/),
  durationHours: z.coerce.number().int().min(1).max(87600),
  status: z.string().optional(),
});
const bulkCodeSchema = z.object({
  count: z.coerce.number().int().min(1).max(100),
  durationHours: z.coerce.number().int().min(1).max(87600),
  prefix: z.string().trim().max(16).regex(/^$|^[A-Za-z0-9_-]+$/),
});

async function brands(): Promise<Array<Record<string, unknown>>> {
  return repository.listBrands();
}

function vehicleDraft(body: Record<string, unknown>, id?: number): Record<string, unknown> {
  return { id, brand_id: body.brandId, code: body.code, name: body.name, image_path: body.imagePath, synopsis: body.synopsis, folder_name: body.folderName, menu_type: body.menuType, manual_id: body.manualId, sort: body.sort, is_show: body.isShow ? 1 : 0 };
}

function memberDraft(body: Record<string, unknown>, id?: number): Record<string, unknown> {
  return { id, email: body.email, contact_address: body.contactAddress, vip_expires_at: body.vipExpiresAt, status: body.status ? 1 : 0, vip_status: body.vipStatus ? 1 : 0 };
}

function vehicleInput(value: z.infer<typeof vehicleSchema>): VehicleInput {
  return {
    brandId: value.brandId,
    code: value.code,
    name: value.name,
    imagePath: value.imagePath || null,
    synopsis: value.synopsis || null,
    isShow: Boolean(value.isShow),
    folderName: value.folderName,
    manualId: value.manualId === "" ? null : value.manualId,
    menuType: value.menuType || null,
    sort: value.sort,
  };
}

function memberInput(value: z.infer<typeof memberSchema>, passwordHash?: string): MemberInput {
  const vipExpiresAt = value.vipExpiresAt ? `${value.vipExpiresAt}T23:59:59.999Z` : null;
  return {
    email: value.email,
    name: value.email,
    contactAddress: value.contactAddress || null,
    passwordHash,
    status: Boolean(value.status),
    vipStatus: Boolean(value.vipStatus),
    vipExpiresAt,
  };
}

function codeInput(value: z.infer<typeof codeSchema>, code: string): CodeInput {
  return { code, durationHours: value.durationHours, status: Boolean(value.status) };
}

app.get("/admin/vehicles", requireAdmin, async (req: AuthenticatedRequest, res) => {
  const cars = await repository.listVehicles();
  res.send(adminVehiclesView(req.sessionUser!, cars, req.query.saved === "1"));
});

app.get("/admin/vehicles/new", requireAdmin, async (req: AuthenticatedRequest, res) => {
  res.send(adminVehicleFormView(req.sessionUser!, await brands()));
});

app.get("/admin/vehicles/:id/edit", requireAdmin, async (req: AuthenticatedRequest, res) => {
  const car = await repository.getVehicle(Number(req.params.id));
  if (!car) return res.status(404).send("Not found");
  res.send(adminVehicleFormView(req.sessionUser!, await brands(), car));
});

app.post("/admin/vehicles", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send(adminVehicleFormView(req.sessionUser!, await brands(), vehicleDraft(req.body), "Check the vehicle fields and manual folder name."));
  await repository.createVehicle(vehicleInput(parsed.data));
  res.redirect("/admin/vehicles?saved=1");
});

app.post("/admin/vehicles/:id", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = vehicleSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) return res.status(400).send(adminVehicleFormView(req.sessionUser!, await brands(), vehicleDraft(req.body, id), "Check the vehicle fields and manual folder name."));
  if (!await repository.updateVehicle(id, vehicleInput(parsed.data))) return res.status(404).send("Not found");
  res.redirect("/admin/vehicles?saved=1");
});

app.post("/admin/vehicles/:id/visibility", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = vehicleVisibilitySchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) return res.status(400).send("Invalid visibility request");
  const car = await repository.getVehicle(id);
  if (!car) return res.status(404).send("Not found");
  const updated = await repository.updateVehicle(id, {
    brandId: Number(car.brand_id),
    code: String(car.code),
    name: String(car.name),
    imagePath: car.image_path ? String(car.image_path) : null,
    synopsis: car.synopsis ? String(car.synopsis) : null,
    isShow: parsed.data.visible === "1",
    folderName: String(car.folder_name),
    manualId: car.manual_id === null || car.manual_id === undefined || car.manual_id === "" ? null : Number(car.manual_id),
    menuType: car.menu_type ? String(car.menu_type) : null,
    sort: Number(car.sort || 0),
  });
  if (!updated) return res.status(404).send("Not found");
  res.redirect("/admin/vehicles?saved=1");
});

app.get("/admin/members", requireAdmin, async (req: AuthenticatedRequest, res) => {
  const members = await repository.listMembers();
  res.send(adminMembersView(req.sessionUser!, members, req.query.saved === "1", req.query.extended === "1"));
});

app.get("/admin/members/new", requireAdmin, (req: AuthenticatedRequest, res) => {
  res.send(adminMemberFormView(req.sessionUser!));
});

app.get("/admin/members/:id/edit", requireAdmin, async (req: AuthenticatedRequest, res) => {
  const member = await repository.getMember(Number(req.params.id));
  if (!member) return res.status(404).send("Not found");
  res.send(adminMemberFormView(req.sessionUser!, member));
});

app.post("/admin/members", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.password.length < 10) return res.status(400).send(adminMemberFormView(req.sessionUser!, memberDraft(req.body), "Enter a valid email and a password of at least 10 characters."));
  try {
    const input = memberInput(parsed.data, hashPassword(parsed.data.password));
    await repository.createMember({ ...input, passwordHash: input.passwordHash! });
    res.redirect("/admin/members?saved=1");
  } catch {
    res.status(409).send(adminMemberFormView(req.sessionUser!, memberDraft(req.body), "That email address is already registered."));
  }
});

app.post("/admin/members/:id", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = memberSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success || (parsed.data.password && parsed.data.password.length < 10)) return res.status(400).send(adminMemberFormView(req.sessionUser!, memberDraft(req.body, id), "Check the member details. A new password must have at least 10 characters."));
  try {
    const passwordHash = parsed.data.password ? hashPassword(parsed.data.password) : undefined;
    if (!await repository.updateMember(id, memberInput(parsed.data, passwordHash))) return res.status(404).send("Not found");
    res.redirect("/admin/members?saved=1");
  } catch {
    res.status(409).send(adminMemberFormView(req.sessionUser!, memberDraft(req.body, id), "That email address is already registered."));
  }
});

app.post("/admin/members/:id/extend", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = memberExtensionSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) return res.status(400).send("Enter a valid extension period.");
  if (!await repository.extendMemberVip(id, parsed.data.days)) return res.status(404).send("Not found");
  res.redirect("/admin/members?extended=1");
});

app.get("/admin/codes", requireAdmin, async (req: AuthenticatedRequest, res) => {
  const codes = await repository.listCodes();
  const generated = Number(req.query.generated);
  res.send(adminCodesView(req.sessionUser!, codes, req.query.saved === "1", Number.isInteger(generated) ? generated : 0));
});

app.get("/admin/codes/new", requireAdmin, (req: AuthenticatedRequest, res) => {
  res.send(adminCodeFormView(req.sessionUser!));
});

app.get("/admin/codes/:id/edit", requireAdmin, async (req: AuthenticatedRequest, res) => {
  const code = await repository.getCode(Number(req.params.id));
  if (!code) return res.status(404).send("Not found");
  res.send(adminCodeFormView(req.sessionUser!, code));
});

app.post("/admin/codes", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send(adminCodeFormView(req.sessionUser!, { code: req.body.code, duration_hours: req.body.durationHours, status: req.body.status ? 1 : 0 }, "Enter a valid code and access duration."));
  const code = parsed.data.code || randomBytes(8).toString("hex");
  try {
    await repository.createCode(codeInput(parsed.data, code));
    res.redirect("/admin/codes?saved=1");
  } catch {
    res.status(409).send(adminCodeFormView(req.sessionUser!, { code, duration_hours: parsed.data.durationHours, status: parsed.data.status ? 1 : 0 }, "That authorization code already exists."));
  }
});

app.post("/admin/codes/bulk", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const parsed = bulkCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send("Choose 1 to 100 codes, a valid duration, and an optional letters-and-numbers prefix.");
  const prefix = parsed.data.prefix ? `${parsed.data.prefix.toUpperCase()}-` : "";
  for (let index = 0; index < parsed.data.count; index += 1) {
    const code = `${prefix}${randomBytes(10).toString("hex").toUpperCase()}`;
    await repository.createCode({ code, durationHours: parsed.data.durationHours, status: true });
  }
  res.redirect(`/admin/codes?generated=${parsed.data.count}`);
});

app.post("/admin/codes/:id", requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = codeSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success || !parsed.data.code) return res.status(400).send(adminCodeFormView(req.sessionUser!, { id, code: req.body.code, duration_hours: req.body.durationHours, status: req.body.status ? 1 : 0 }, "Enter a valid code and access duration."));
  try {
    if (!await repository.updateCode(id, codeInput(parsed.data, parsed.data.code))) return res.status(404).send("Not found");
    res.redirect("/admin/codes?saved=1");
  } catch {
    res.status(409).send(adminCodeFormView(req.sessionUser!, { id, code: req.body.code, duration_hours: req.body.durationHours, status: req.body.status ? 1 : 0 }, "That authorization code already exists."));
  }
});

app.use((_req, res) => res.status(404).send("Not found"));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).send("Internal server error");
});

const server = app.listen(config.port, () => console.log(`Supercar Docs listening on http://localhost:${config.port}`));

function shutdown(): void {
  server.close(() => {
    repository.close().finally(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
