import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SqlJsDatabase } from "./sqlite.js";
import {
  migrationCounts,
  orderManualMenuRows,
  readSupabaseMigrationDataset,
} from "./supabase-migration.js";

test("orders parent manual rows before children and rejects cycles", () => {
  const ordered = orderManualMenuRows([
    { id: 2, car_id: 1, source_menu_id: 2, parent_id: 1, name: "Child", relative_file: "Repair/2.html", sort: 1 },
    { id: 1, car_id: 1, source_menu_id: 1, parent_id: null, name: "Root", relative_file: null, sort: 0 },
  ]);
  assert.deepEqual(ordered.map((row) => row.id), [1, 2]);
  assert.throws(() => orderManualMenuRows([
    { id: 1, car_id: 1, source_menu_id: 1, parent_id: 2, name: "One", relative_file: null, sort: 0 },
    { id: 2, car_id: 1, source_menu_id: 2, parent_id: 1, name: "Two", relative_file: null, sort: 0 },
  ]), /cycle/);
});

test("extracts and normalizes a SQLite migration dataset", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "kks-supabase-test-"));
  const databaseFile = path.join(temporary, "source.db");
  const database = new SqlJsDatabase(databaseFile);
  try {
    database.exec(`
      CREATE TABLE brands (id INTEGER PRIMARY KEY, brand_name TEXT, sort INTEGER, created_at TEXT);
      CREATE TABLE cars (id INTEGER PRIMARY KEY, brand_id INTEGER, code TEXT, name TEXT, image_path TEXT, synopsis TEXT, is_show INTEGER, folder_name TEXT, manual_id INTEGER, menu_type TEXT, sort INTEGER, created_at TEXT, updated_at TEXT);
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, password_hash TEXT, contact_address TEXT, auth_code TEXT, status INTEGER, vip_status INTEGER, vip_expires_at TEXT, role TEXT, created_at TEXT);
      CREATE TABLE authorization_codes (id INTEGER PRIMARY KEY, code TEXT, duration_hours REAL, expires_at TEXT, is_used INTEGER, status INTEGER, created_at TEXT);
      CREATE TABLE manual_menu (id INTEGER PRIMARY KEY, car_id INTEGER, source_menu_id INTEGER, parent_id INTEGER, name TEXT, relative_file TEXT, sort INTEGER);
      INSERT INTO brands VALUES (1, 'BMW', 10, NULL);
      INSERT INTO cars VALUES (2, 1, 'B01', 'BMW One', NULL, NULL, 1, 'bmw-one', 20, NULL, 5, NULL, NULL);
      INSERT INTO users VALUES (3, 'USER@example.com', 'User', 'scrypt$hash', NULL, NULL, 1, 0, NULL, 'customer', '2026-01-01T00:00:00.000Z');
      INSERT INTO authorization_codes VALUES (4, 'CODE', 24, NULL, 0, 1, NULL);
      INSERT INTO manual_menu VALUES (6, 2, 2, 5, 'Child', 'Repair/2.html', 1);
      INSERT INTO manual_menu VALUES (5, 2, 1, NULL, 'Root', NULL, 0);
    `);
  } finally {
    database.close();
  }

  try {
    const dataset = readSupabaseMigrationDataset(databaseFile);
    assert.deepEqual(migrationCounts(dataset), {
      brands: 1,
      cars: 1,
      app_users: 1,
      authorization_codes: 1,
      manual_menu: 2,
    });
    assert.equal(dataset.cars[0]?.is_show, true);
    assert.equal(dataset.app_users[0]?.vip_status, false);
    assert.deepEqual(dataset.manual_menu.map((row) => row.id), [5, 6]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

