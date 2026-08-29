import { randomBytes } from "node:crypto";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import {
  createSession,
  deleteSession,
  getSessionUser,
  initializeDatabase,
  type SessionUser,
} from "./db.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createManualBundleHandler } from "./manual-bundle.js";
import {
  adminCodeFormView,
  adminCodesView,
  adminMemberFormView,
  adminMembersView,
  adminVehicleFormView,
  adminVehiclesView,
  adminView,
  loginView,
  registerView,
  vehicleDetailView,
  vehicleListView,
} from "./views.js";

const app = express();
const db = initializeDatabase();
const configuredPort = process.env.PORT;
const port = configuredPort && /^\d+$/.test(configuredPort) ? Number(configuredPort) : configuredPort || 3000;
const production = process.env.NODE_ENV === "production";
if (production) app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(express.json({ limit: "64kb" }));
app.use(express.static("public", { maxAge: production ? "7d" : 0 }));

type AuthenticatedRequest = Request & { sessionUser?: SessionUser; sessionToken?: string };

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of (header || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    result[item.slice(0, separator).trim()] = decodeURIComponent(item.slice(separator + 1).trim());
  }
  return result;
}

function sessionMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const token = parseCookies(req.headers.cookie).kks_session;
  req.sessionToken = token;
  req.sessionUser = getSessionUser(db, token) || undefined;
  next();
}

function requireUser(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.sessionUser) {
    res.redirect("/login");
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

app.use(sessionMiddleware);
const manualsDirectory = path.resolve(process.env.MANUALS_DIR || "manuals");
const manualBundleFile = path.resolve(process.env.MANUAL_BUNDLE_PATH || "private-data/manuals.bundle");
const manualIndexFile = path.resolve(process.env.MANUAL_INDEX_PATH || "private-data/manuals-index.json");
app.use(
  "/manuals",
  requireUser,
  express.static(manualsDirectory, { fallthrough: true, maxAge: production ? "1d" : 0 }),
  createManualBundleHandler(manualBundleFile, manualIndexFile),
  (_req, res) => res.status(404).send("Manual file not found"),
);
app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  const expectedOrigin = process.env.PUBLIC_ORIGIN;
  const suppliedOrigin = req.get("origin");
  if (production && expectedOrigin && suppliedOrigin && suppliedOrigin !== expectedOrigin) {
    res.status(403).send("Origin not allowed");
    return;
  }
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
const registerSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  authCode: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(200),
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", database: "connected" });
});

app.get("/login", (req: AuthenticatedRequest, res) => {
  if (req.sessionUser) return res.redirect(req.sessionUser.role === "admin" ? "/admin" : "/vehicles");
  res.send(loginView());
});

app.get("/register", (req: AuthenticatedRequest, res) => {
  if (req.sessionUser) return res.redirect(req.sessionUser.role === "admin" ? "/admin" : "/vehicles");
  res.send(registerView());
});

app.post("/register", loginLimiter, (req: AuthenticatedRequest, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send(registerView("Enter a valid email, name, authorization code, and password of at least 10 characters.", req.body));

  const register = db.transaction(() => {
    const code = db.prepare("SELECT id, duration_hours FROM authorization_codes WHERE code=? AND status=1 AND is_used=0")
      .get(parsed.data.authCode) as { id: number; duration_hours: number } | undefined;
    if (!code) return null;
    const vipExpiresAt = code.duration_hours > 0
      ? new Date(Date.now() + code.duration_hours * 60 * 60 * 1000).toISOString()
      : null;
    const inserted = db.prepare(`
      INSERT INTO users (email, name, password_hash, auth_code, status, vip_status, vip_expires_at, role)
      VALUES (?, ?, ?, ?, 1, 1, ?, 'customer')
    `).run(parsed.data.email, parsed.data.name, hashPassword(parsed.data.password), parsed.data.authCode, vipExpiresAt);
    const redeemed = db.prepare("UPDATE authorization_codes SET is_used=1 WHERE id=? AND is_used=0").run(code.id);
    if (redeemed.changes !== 1) throw new Error("Authorization code redemption failed");
    return Number(inserted.lastInsertRowid);
  });

  try {
    const userId = register();
    if (!userId) return res.status(400).send(registerView("That authorization code is invalid, disabled, or already used.", req.body));
    const session = createSession(db, userId);
    const cookie = [`kks_session=${encodeURIComponent(session.token)}`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=43200"];
    if (production) cookie.push("Secure");
    res.setHeader("Set-Cookie", cookie.join("; "));
    res.redirect("/vehicles");
  } catch {
    res.status(409).send(registerView("That email address is already registered.", req.body));
  }
});

app.post("/login", loginLimiter, (req: AuthenticatedRequest, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send(loginView("Enter a valid email and password."));
  const user = db.prepare("SELECT id, password_hash, role, status FROM users WHERE email = ? COLLATE NOCASE")
    .get(parsed.data.email) as { id: number; password_hash: string; role: string; status: number } | undefined;
  if (!user || user.status !== 1 || !verifyPassword(parsed.data.password, user.password_hash)) {
    return res.status(401).send(loginView("Email or password is incorrect."));
  }
  const session = createSession(db, user.id);
  const cookie = [`kks_session=${encodeURIComponent(session.token)}`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=43200"];
  if (production) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
  res.redirect(user.role === "admin" ? "/admin" : "/vehicles");
});

app.post("/logout", requireUser, requireCsrf, (req: AuthenticatedRequest, res) => {
  deleteSession(db, req.sessionToken);
  res.setHeader("Set-Cookie", "kks_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  res.redirect("/login");
});

app.get("/", (req: AuthenticatedRequest, res) => {
  if (!req.sessionUser) return res.redirect("/login");
  res.redirect(req.sessionUser.role === "admin" ? "/admin" : "/vehicles");
});

app.get("/vehicles", requireUser, (req: AuthenticatedRequest, res) => {
  const cars = db.prepare(`SELECT c.*, b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id WHERE c.is_show=1 ORDER BY c.sort DESC, c.name`).all() as Array<Record<string, unknown>>;
  res.send(vehicleListView(req.sessionUser!, cars));
});

app.get("/vehicles/:id", requireUser, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).send("Not found");
  const car = db.prepare(`SELECT c.*, b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id WHERE c.id=?`).get(id) as Record<string, unknown> | undefined;
  if (!car) return res.status(404).send("Not found");
  const menu = db.prepare("SELECT * FROM manual_menu WHERE car_id=? ORDER BY sort, name").all(id) as Array<Record<string, unknown>>;
  res.send(vehicleDetailView(req.sessionUser!, car, menu));
});

app.get("/admin", requireAdmin, (req: AuthenticatedRequest, res) => {
  const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS value FROM ${table}`).get() as { value: number }).value);
  const cars = db.prepare(`SELECT c.*, b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id ORDER BY c.sort DESC LIMIT 8`).all() as Array<Record<string, unknown>>;
  const users = db.prepare("SELECT email,name,status,vip_status,vip_expires_at FROM users WHERE role='customer' ORDER BY id DESC LIMIT 8").all() as Array<Record<string, unknown>>;
  const codes = db.prepare("SELECT code,duration_hours,is_used,status FROM authorization_codes ORDER BY id DESC LIMIT 8").all() as Array<Record<string, unknown>>;
  const customerCount = Number((db.prepare("SELECT COUNT(*) AS value FROM users WHERE role='customer'").get() as { value: number }).value);
  res.send(adminView(req.sessionUser!, {
    counts: { Vehicles: count("cars"), Brands: count("brands"), Members: customerCount, "Authorization codes": count("authorization_codes") },
    cars,
    users,
    codes,
  }));
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
  name: z.string().trim().min(1).max(120),
  contactAddress: z.string().trim().max(500),
  password: z.string().max(200),
  vipExpiresAt: z.union([z.literal(""), z.iso.date()]),
  status: z.string().optional(),
  vipStatus: z.string().optional(),
});
const codeSchema = z.object({
  code: z.string().trim().max(100).regex(/^$|^[A-Za-z0-9_-]+$/),
  durationHours: z.coerce.number().int().min(1).max(87600),
  status: z.string().optional(),
});

function brands(): Array<Record<string, unknown>> {
  return db.prepare("SELECT id, brand_name FROM brands ORDER BY sort DESC, brand_name").all() as Array<Record<string, unknown>>;
}

function vehicleDraft(body: Record<string, unknown>, id?: number): Record<string, unknown> {
  return { id, brand_id: body.brandId, code: body.code, name: body.name, image_path: body.imagePath, synopsis: body.synopsis, folder_name: body.folderName, menu_type: body.menuType, manual_id: body.manualId, sort: body.sort, is_show: body.isShow ? 1 : 0 };
}

function memberDraft(body: Record<string, unknown>, id?: number): Record<string, unknown> {
  return { id, email: body.email, name: body.name, contact_address: body.contactAddress, vip_expires_at: body.vipExpiresAt, status: body.status ? 1 : 0, vip_status: body.vipStatus ? 1 : 0 };
}

app.get("/admin/vehicles", requireAdmin, (req: AuthenticatedRequest, res) => {
  const cars = db.prepare(`SELECT c.*, b.brand_name FROM cars c JOIN brands b ON b.id=c.brand_id ORDER BY c.sort DESC, c.name`).all() as Array<Record<string, unknown>>;
  res.send(adminVehiclesView(req.sessionUser!, cars, req.query.saved === "1"));
});

app.get("/admin/vehicles/new", requireAdmin, (req: AuthenticatedRequest, res) => {
  res.send(adminVehicleFormView(req.sessionUser!, brands()));
});

app.get("/admin/vehicles/:id/edit", requireAdmin, (req: AuthenticatedRequest, res) => {
  const car = db.prepare("SELECT * FROM cars WHERE id=?").get(Number(req.params.id)) as Record<string, unknown> | undefined;
  if (!car) return res.status(404).send("Not found");
  res.send(adminVehicleFormView(req.sessionUser!, brands(), car));
});

app.post("/admin/vehicles", requireAdmin, requireCsrf, (req: AuthenticatedRequest, res) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send(adminVehicleFormView(req.sessionUser!, brands(), vehicleDraft(req.body), "Check the vehicle fields and manual folder name."));
  const value = parsed.data;
  db.prepare(`INSERT INTO cars (brand_id,code,name,image_path,synopsis,is_show,folder_name,manual_id,menu_type,sort) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(value.brandId, value.code, value.name, value.imagePath || null, value.synopsis || null, value.isShow ? 1 : 0, value.folderName, value.manualId === "" ? null : value.manualId, value.menuType || null, value.sort);
  res.redirect("/admin/vehicles?saved=1");
});

app.post("/admin/vehicles/:id", requireAdmin, requireCsrf, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = vehicleSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) return res.status(400).send(adminVehicleFormView(req.sessionUser!, brands(), vehicleDraft(req.body, id), "Check the vehicle fields and manual folder name."));
  const value = parsed.data;
  const result = db.prepare(`UPDATE cars SET brand_id=?,code=?,name=?,image_path=?,synopsis=?,is_show=?,folder_name=?,manual_id=?,menu_type=?,sort=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(value.brandId, value.code, value.name, value.imagePath || null, value.synopsis || null, value.isShow ? 1 : 0, value.folderName, value.manualId === "" ? null : value.manualId, value.menuType || null, value.sort, id);
  if (!result.changes) return res.status(404).send("Not found");
  res.redirect("/admin/vehicles?saved=1");
});

app.get("/admin/members", requireAdmin, (req: AuthenticatedRequest, res) => {
  const members = db.prepare("SELECT id,email,name,contact_address,status,vip_status,vip_expires_at FROM users WHERE role='customer' ORDER BY id DESC").all() as Array<Record<string, unknown>>;
  res.send(adminMembersView(req.sessionUser!, members, req.query.saved === "1"));
});

app.get("/admin/members/new", requireAdmin, (req: AuthenticatedRequest, res) => {
  res.send(adminMemberFormView(req.sessionUser!));
});

app.get("/admin/members/:id/edit", requireAdmin, (req: AuthenticatedRequest, res) => {
  const member = db.prepare("SELECT id,email,name,contact_address,status,vip_status,vip_expires_at FROM users WHERE id=? AND role='customer'").get(Number(req.params.id)) as Record<string, unknown> | undefined;
  if (!member) return res.status(404).send("Not found");
  res.send(adminMemberFormView(req.sessionUser!, member));
});

app.post("/admin/members", requireAdmin, requireCsrf, (req: AuthenticatedRequest, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.password.length < 10) return res.status(400).send(adminMemberFormView(req.sessionUser!, memberDraft(req.body), "Enter a valid email and a password of at least 10 characters."));
  const value = parsed.data;
  try {
    db.prepare(`INSERT INTO users (email,name,password_hash,contact_address,status,vip_status,vip_expires_at,role) VALUES (?,?,?,?,?,?,?,'customer')`)
      .run(value.email, value.name, hashPassword(value.password), value.contactAddress || null, value.status ? 1 : 0, value.vipStatus ? 1 : 0, value.vipExpiresAt || null);
    res.redirect("/admin/members?saved=1");
  } catch {
    res.status(409).send(adminMemberFormView(req.sessionUser!, memberDraft(req.body), "That email address is already registered."));
  }
});

app.post("/admin/members/:id", requireAdmin, requireCsrf, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = memberSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success || (parsed.data.password && parsed.data.password.length < 10)) return res.status(400).send(adminMemberFormView(req.sessionUser!, memberDraft(req.body, id), "Check the member details. A new password must have at least 10 characters."));
  const value = parsed.data;
  try {
    const result = db.prepare(`UPDATE users SET email=?,name=?,contact_address=?,status=?,vip_status=?,vip_expires_at=? WHERE id=? AND role='customer'`)
      .run(value.email, value.name, value.contactAddress || null, value.status ? 1 : 0, value.vipStatus ? 1 : 0, value.vipExpiresAt || null, id);
    if (!result.changes) return res.status(404).send("Not found");
    if (value.password) db.prepare("UPDATE users SET password_hash=? WHERE id=? AND role='customer'").run(hashPassword(value.password), id);
    res.redirect("/admin/members?saved=1");
  } catch {
    res.status(409).send(adminMemberFormView(req.sessionUser!, memberDraft(req.body, id), "That email address is already registered."));
  }
});

app.get("/admin/codes", requireAdmin, (req: AuthenticatedRequest, res) => {
  const codes = db.prepare("SELECT id,code,duration_hours,is_used,status FROM authorization_codes ORDER BY id DESC").all() as Array<Record<string, unknown>>;
  res.send(adminCodesView(req.sessionUser!, codes, req.query.saved === "1"));
});

app.get("/admin/codes/new", requireAdmin, (req: AuthenticatedRequest, res) => {
  res.send(adminCodeFormView(req.sessionUser!));
});

app.get("/admin/codes/:id/edit", requireAdmin, (req: AuthenticatedRequest, res) => {
  const code = db.prepare("SELECT id,code,duration_hours,is_used,status FROM authorization_codes WHERE id=?").get(Number(req.params.id)) as Record<string, unknown> | undefined;
  if (!code) return res.status(404).send("Not found");
  res.send(adminCodeFormView(req.sessionUser!, code));
});

app.post("/admin/codes", requireAdmin, requireCsrf, (req: AuthenticatedRequest, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).send(adminCodeFormView(req.sessionUser!, { code: req.body.code, duration_hours: req.body.durationHours, status: req.body.status ? 1 : 0 }, "Enter a valid code and access duration."));
  const value = parsed.data;
  const code = value.code || randomBytes(8).toString("hex");
  try {
    db.prepare("INSERT INTO authorization_codes (code,duration_hours,is_used,status) VALUES (?,?,0,?)").run(code, value.durationHours, value.status ? 1 : 0);
    res.redirect("/admin/codes?saved=1");
  } catch {
    res.status(409).send(adminCodeFormView(req.sessionUser!, { code, duration_hours: value.durationHours, status: value.status ? 1 : 0 }, "That authorization code already exists."));
  }
});

app.post("/admin/codes/:id", requireAdmin, requireCsrf, (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const parsed = codeSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success || !parsed.data.code) return res.status(400).send(adminCodeFormView(req.sessionUser!, { id, code: req.body.code, duration_hours: req.body.durationHours, status: req.body.status ? 1 : 0 }, "Enter a valid code and access duration."));
  try {
    const result = db.prepare("UPDATE authorization_codes SET code=?,duration_hours=?,status=? WHERE id=?")
      .run(parsed.data.code, parsed.data.durationHours, parsed.data.status ? 1 : 0, id);
    if (!result.changes) return res.status(404).send("Not found");
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

const server = app.listen(port, () => console.log(`KKS Repair listening on http://localhost:${port}`));

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
