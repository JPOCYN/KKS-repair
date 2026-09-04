import { existsSync } from "node:fs";
import path from "node:path";
import { SqlJsDatabase } from "./sqlite.js";
import type {
  AppUserRow,
  AuthorizationCodeRow,
  BrandRow,
  CarRow,
  ManualMenuRow,
} from "./supabase-types.js";

export interface SupabaseMigrationDataset {
  brands: BrandRow[];
  cars: CarRow[];
  app_users: AppUserRow[];
  authorization_codes: AuthorizationCodeRow[];
  manual_menu: ManualMenuRow[];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is missing`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requiredNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} is not numeric`);
  return number;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value: unknown): boolean {
  return Number(value) === 1 || value === true;
}

function queryRows(database: SqlJsDatabase, sql: string): Array<Record<string, unknown>> {
  return database.prepare(sql).all() as Array<Record<string, unknown>>;
}

export function orderManualMenuRows(rows: ManualMenuRow[]): ManualMenuRow[] {
  const byId = new Map<number, ManualMenuRow>();
  for (const row of rows) {
    if (byId.has(row.id)) throw new Error(`Duplicate manual_menu id ${row.id}`);
    byId.set(row.id, row);
  }

  const depthById = new Map<number, number>();
  const visiting = new Set<number>();
  function depth(row: ManualMenuRow): number {
    const known = depthById.get(row.id);
    if (known !== undefined) return known;
    if (visiting.has(row.id)) throw new Error(`manual_menu cycle at id ${row.id}`);
    visiting.add(row.id);
    let value = 0;
    if (row.parent_id !== null) {
      const parent = byId.get(row.parent_id);
      if (!parent) throw new Error(`manual_menu parent ${row.parent_id} is missing`);
      if (parent.car_id !== row.car_id) throw new Error(`manual_menu parent ${row.parent_id} belongs to another car`);
      value = depth(parent) + 1;
    }
    visiting.delete(row.id);
    depthById.set(row.id, value);
    return value;
  }

  return [...rows].sort((left, right) => depth(left) - depth(right) || left.id - right.id);
}

export function validateSupabaseMigrationDataset(dataset: SupabaseMigrationDataset): void {
  const brandIds = new Set(dataset.brands.map((row) => row.id));
  const carIds = new Set(dataset.cars.map((row) => row.id));
  for (const car of dataset.cars) {
    if (!brandIds.has(car.brand_id)) throw new Error(`Car ${car.id} references missing brand ${car.brand_id}`);
  }
  for (const item of dataset.manual_menu) {
    if (!carIds.has(item.car_id)) throw new Error(`Manual item ${item.id} references missing car ${item.car_id}`);
  }

  const unique = <T>(rows: T[], key: (row: T) => string, label: string): void => {
    const seen = new Set<string>();
    for (const row of rows) {
      const value = key(row);
      if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
      seen.add(value);
    }
  };
  unique(dataset.brands, (row) => row.brand_name.toLowerCase(), "brand name");
  unique(dataset.cars, (row) => row.code, "car code");
  unique(dataset.app_users, (row) => row.email.toLowerCase(), "user email");
  unique(dataset.authorization_codes, (row) => row.code, "authorization code");
  orderManualMenuRows(dataset.manual_menu);
}

export function readSupabaseMigrationDataset(databaseFile: string): SupabaseMigrationDataset {
  const resolved = path.resolve(databaseFile);
  if (!existsSync(resolved)) throw new Error(`SQLite database not found: ${resolved}`);
  const database = new SqlJsDatabase(resolved);
  try {
    const brands = queryRows(database, "SELECT id, brand_name, sort, created_at FROM brands ORDER BY id").map((row): BrandRow => ({
      id: requiredNumber(row.id, "brands.id"),
      brand_name: requiredString(row.brand_name, "brands.brand_name"),
      sort: requiredNumber(row.sort, "brands.sort"),
      created_at: nullableString(row.created_at),
    }));
    const cars = queryRows(database, `
      SELECT id, brand_id, code, name, image_path, synopsis, is_show, folder_name,
             manual_id, menu_type, sort, created_at, updated_at
      FROM cars ORDER BY id
    `).map((row): CarRow => ({
      id: requiredNumber(row.id, "cars.id"),
      brand_id: requiredNumber(row.brand_id, "cars.brand_id"),
      code: requiredString(row.code, "cars.code"),
      name: requiredString(row.name, "cars.name"),
      image_path: nullableString(row.image_path),
      synopsis: nullableString(row.synopsis),
      is_show: booleanValue(row.is_show),
      folder_name: requiredString(row.folder_name, "cars.folder_name"),
      manual_id: nullableNumber(row.manual_id),
      menu_type: nullableString(row.menu_type),
      sort: requiredNumber(row.sort, "cars.sort"),
      created_at: nullableString(row.created_at),
      updated_at: nullableString(row.updated_at),
    }));
    const appUsers = queryRows(database, `
      SELECT id, email, name, password_hash, contact_address, auth_code, status,
             vip_status, vip_expires_at, role, created_at
      FROM users ORDER BY id
    `).map((row): AppUserRow => ({
      id: requiredNumber(row.id, "users.id"),
      email: requiredString(row.email, "users.email").trim(),
      name: requiredString(row.name, "users.name"),
      password_hash: requiredString(row.password_hash, "users.password_hash"),
      contact_address: nullableString(row.contact_address),
      auth_code: nullableString(row.auth_code),
      status: booleanValue(row.status),
      vip_status: booleanValue(row.vip_status),
      vip_expires_at: nullableString(row.vip_expires_at),
      role: row.role === "admin" ? "admin" : "customer",
      created_at: requiredString(row.created_at, "users.created_at"),
    }));
    const authorizationCodes = queryRows(database, `
      SELECT id, code, duration_hours, expires_at, is_used, status, created_at
      FROM authorization_codes ORDER BY id
    `).map((row): AuthorizationCodeRow => ({
      id: requiredNumber(row.id, "authorization_codes.id"),
      code: requiredString(row.code, "authorization_codes.code"),
      duration_hours: requiredNumber(row.duration_hours, "authorization_codes.duration_hours"),
      expires_at: nullableString(row.expires_at),
      is_used: booleanValue(row.is_used),
      status: booleanValue(row.status),
      redeemed_by_user_id: null,
      redeemed_at: null,
      created_at: nullableString(row.created_at),
    }));
    const manualMenu = orderManualMenuRows(queryRows(database, `
      SELECT id, car_id, source_menu_id, parent_id, name, relative_file, sort
      FROM manual_menu ORDER BY id
    `).map((row): ManualMenuRow => ({
      id: requiredNumber(row.id, "manual_menu.id"),
      car_id: requiredNumber(row.car_id, "manual_menu.car_id"),
      source_menu_id: nullableNumber(row.source_menu_id),
      parent_id: nullableNumber(row.parent_id),
      name: requiredString(row.name, "manual_menu.name"),
      relative_file: nullableString(row.relative_file),
      sort: requiredNumber(row.sort, "manual_menu.sort"),
    })));

    const dataset = {
      brands,
      cars,
      app_users: appUsers,
      authorization_codes: authorizationCodes,
      manual_menu: manualMenu,
    };
    validateSupabaseMigrationDataset(dataset);
    return dataset;
  } finally {
    database.close();
  }
}

export function migrationCounts(dataset: SupabaseMigrationDataset): Record<keyof SupabaseMigrationDataset, number> {
  return {
    brands: dataset.brands.length,
    cars: dataset.cars.length,
    app_users: dataset.app_users.length,
    authorization_codes: dataset.authorization_codes.length,
    manual_menu: dataset.manual_menu.length,
  };
}
