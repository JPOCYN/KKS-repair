import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "./password.js";
import { SqlJsDatabase } from "./sqlite.js";

export type AppDatabase = SqlJsDatabase;

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: "admin" | "customer";
  csrfToken: string;
}

export interface RecoveredMember {
  id: number;
  mobile: string;
  userName?: string | null;
  password: string;
  contactAddress?: string | null;
  authCode?: string | null;
  status?: number | string | null;
  vipStatus?: number | string | null;
  vipExpirationTime?: string | null;
  createTime?: string | null;
}

export interface RecoveredCode {
  id: number;
  authCode: string;
  expirationTime?: string | null;
  isUse?: number | string | null;
  status?: number | string | null;
  createTime?: string | null;
}

export interface RecoveredManualItem {
  sourceId: number;
  menuId: string;
  parentSourceId: number | null;
  name: string;
  flag: boolean;
  depth: number;
  sort: number;
}

export interface RecoveredManual {
  carId: number;
  manualId: number;
  rootName: string;
  items: RecoveredManualItem[];
}

export function normalizeRecoveredActiveFlag(value: number | string | null | undefined): number {
  // The retired application used 0 for enabled and 1 for disabled.
  return Number(value ?? 0) === 0 ? 1 : 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function initializeDatabase(): AppDatabase {
  const dataDirectory = path.resolve(process.env.DATA_DIR || "data");
  mkdirSync(dataDirectory, { recursive: true });
  const db = new SqlJsDatabase(path.join(dataDirectory, "kks-repair.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY,
      brand_name TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY,
      brand_id INTEGER NOT NULL REFERENCES brands(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      image_path TEXT,
      synopsis TEXT,
      is_show INTEGER NOT NULL DEFAULT 1,
      folder_name TEXT NOT NULL,
      manual_id INTEGER,
      menu_type TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      contact_address TEXT,
      auth_code TEXT,
      status INTEGER NOT NULL DEFAULT 1,
      vip_status INTEGER NOT NULL DEFAULT 0,
      vip_expires_at TEXT,
      role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('admin','customer')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS authorization_codes (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      duration_hours REAL NOT NULL DEFAULT 0,
      expires_at TEXT,
      is_used INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS manual_menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
      source_menu_id INTEGER,
      parent_id INTEGER REFERENCES manual_menu(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      relative_file TEXT,
      sort INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS manual_menu_car_id_idx ON manual_menu(car_id);
  `);

  const codeColumns = db.prepare("PRAGMA table_info(authorization_codes)").all() as Array<{ name: string }>;
  if (!codeColumns.some((column) => column.name === "duration_hours")) {
    db.exec("ALTER TABLE authorization_codes ADD COLUMN duration_hours REAL NOT NULL DEFAULT 0");
  }

  seedCatalog(db);
  seedManualMenus(db);
  ensureConfiguredAdmin(db);
  return db;
}

function seedManualMenus(db: AppDatabase): void {
  const menuFile = path.resolve("recovery", "catalog", "manual-menus.json");
  if (!existsSync(menuFile)) return;
  const count = Number((db.prepare("SELECT COUNT(*) AS value FROM manual_menu").get() as { value: number }).value);
  if (count > 0) return;
  const recovered = readJson<{ manuals: RecoveredManual[] }>(menuFile);
  importRecoveredManuals(db, recovered.manuals);
}

function seedCatalog(db: AppDatabase): void {
  const catalogDirectory = path.resolve("recovery", "catalog");
  const brandsFile = path.join(catalogDirectory, "brands.json");
  const carsFile = path.join(catalogDirectory, "cars.json");
  if (!existsSync(brandsFile) || !existsSync(carsFile)) return;

  const brands = readJson<Array<Record<string, unknown>>>(brandsFile);
  const cars = readJson<Array<Record<string, unknown>>>(carsFile);
  const insertBrand = db.prepare(`
    INSERT INTO brands (id, brand_name, sort, created_at)
    VALUES (@id, @brandName, @sort, @createTime)
    ON CONFLICT(id) DO UPDATE SET brand_name=excluded.brand_name, sort=excluded.sort
  `);
  const insertCar = db.prepare(`
    INSERT INTO cars (
      id, brand_id, code, name, image_path, synopsis, is_show, folder_name,
      manual_id, menu_type, sort, created_at, updated_at
    ) VALUES (
      @id, @carBrandId, @carNum, @carName, @imagePath, @carSynopsis, @isShow,
      @folderName, @carHandbookUrl, @carMenuType, @sort, @createTime, @updateTime
    )
    ON CONFLICT(id) DO UPDATE SET
      brand_id=excluded.brand_id, code=excluded.code, name=excluded.name,
      image_path=excluded.image_path, synopsis=excluded.synopsis,
      is_show=excluded.is_show, folder_name=excluded.folder_name,
      manual_id=excluded.manual_id, menu_type=excluded.menu_type, sort=excluded.sort,
      updated_at=excluded.updated_at
  `);

  db.transaction(() => {
    for (const brand of brands) insertBrand.run(brand);
    for (const car of cars) {
      const sourceImage = typeof car.carPic === "string" ? path.basename(new URL(car.carPic).pathname) : null;
      const localImage = sourceImage && existsSync(path.resolve("public", "vehicle-images", sourceImage));
      insertCar.run({ ...car, imagePath: localImage ? `/vehicle-images/${sourceImage}` : car.carPic });
    }
  })();
}

function ensureConfiguredAdmin(db: AppDatabase): void {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return;
  db.prepare(`
    INSERT INTO users (email, name, password_hash, status, vip_status, role)
    VALUES (?, 'Administrator', ?, 1, 1, 'admin')
  `).run(email, hashPassword(password));
}

export function importRecoveredMembers(db: AppDatabase, members: RecoveredMember[]): number {
  const upsert = db.prepare(`
    INSERT INTO users (
      id, email, name, password_hash, contact_address, auth_code, status,
      vip_status, vip_expires_at, role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'customer', ?)
    ON CONFLICT(id) DO UPDATE SET
      email=excluded.email, name=excluded.name, password_hash=excluded.password_hash,
      contact_address=excluded.contact_address, auth_code=excluded.auth_code,
      status=excluded.status, vip_status=excluded.vip_status,
      vip_expires_at=excluded.vip_expires_at
  `);
  db.transaction(() => {
    for (const member of members) {
      upsert.run(
        member.id,
        member.mobile.trim(),
        member.userName?.trim() || member.mobile.trim(),
        hashPassword(member.password),
        member.contactAddress || null,
        member.authCode || null,
        normalizeRecoveredActiveFlag(member.status),
        normalizeRecoveredActiveFlag(member.vipStatus),
        member.vipExpirationTime || null,
        member.createTime || new Date().toISOString(),
      );
    }
  })();
  return members.length;
}

export function importRecoveredCodes(db: AppDatabase, codes: RecoveredCode[]): number {
  const upsert = db.prepare(`
    INSERT INTO authorization_codes (id, code, duration_hours, expires_at, is_used, status, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code=excluded.code, duration_hours=excluded.duration_hours,
      is_used=excluded.is_used, status=excluded.status
  `);
  db.transaction(() => {
    for (const code of codes) {
      upsert.run(
        code.id,
        code.authCode,
        Number(code.expirationTime || 0),
        Number(code.isUse ?? 0),
        normalizeRecoveredActiveFlag(code.status),
        code.createTime || null,
      );
    }
  })();
  return codes.length;
}

function manualRelativeFile(item: RecoveredManualItem, bySourceId: Map<number, RecoveredManualItem>): string | null {
  if (!item.flag || item.depth < 2 || item.name.toLowerCase().includes("customer service")) return null;
  let section = item;
  while (section.depth > 1 && section.parentSourceId !== null) {
    const parent = bySourceId.get(section.parentSourceId);
    if (!parent) return null;
    section = parent;
  }
  const sectionName = section.name.toLowerCase();
  const directory = sectionName.includes("repair")
    ? "Repair"
    : sectionName.includes("system")
      ? "System"
      : sectionName.includes("wiring")
        ? "Wiring"
        : null;
  return directory ? `${directory}/${item.menuId}.html` : null;
}

export function importRecoveredManuals(db: AppDatabase, manuals: RecoveredManual[]): { cars: number; items: number } {
  const deleteForCar = db.prepare("DELETE FROM manual_menu WHERE car_id = ?");
  const insert = db.prepare(`
    INSERT INTO manual_menu (car_id, source_menu_id, parent_id, name, relative_file, sort)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  let carCount = 0;
  let itemCount = 0;

  db.transaction(() => {
    for (const manual of manuals) {
      const cars = db.prepare("SELECT id FROM cars WHERE manual_id = ? ORDER BY id").all(manual.manualId) as Array<{ id: number }>;
      const bySourceId = new Map(manual.items.map((item) => [item.sourceId, item]));
      for (const car of cars) {
        deleteForCar.run(car.id);
        const insertedIds = new Map<number, number>();
        for (const item of manual.items) {
          const parentId = item.parentSourceId === null ? null : insertedIds.get(item.parentSourceId) ?? null;
          const result = insert.run(
            car.id,
            item.sourceId,
            parentId,
            item.name,
            manualRelativeFile(item, bySourceId),
            item.sort,
          );
          insertedIds.set(item.sourceId, Number(result.lastInsertRowid));
          itemCount += 1;
        }
        carCount += 1;
      }
    }
  })();

  return { cars: carCount, items: itemCount };
}

export function createSession(db: AppDatabase, userId: number): { token: string; csrfToken: string } {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)")
    .run(sha256(token), userId, csrfToken, expiresAt);
  return { token, csrfToken };
}

export function getSessionUser(db: AppDatabase, token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, s.csrf_token AS csrfToken
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 1
  `).get(sha256(token), new Date().toISOString()) as SessionUser | undefined;
  return row || null;
}

export function deleteSession(db: AppDatabase, token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}
