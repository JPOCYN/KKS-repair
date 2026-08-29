import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SqlJsDatabase } from "./sqlite.js";

test("portable database persists transactions and supports named parameters", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "kks-sqlite-"));
  const filename = path.join(directory, "test.db");
  try {
    const db = new SqlJsDatabase(filename);
    db.exec("CREATE TABLE records (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)");
    const insert = db.prepare("INSERT INTO records (name) VALUES (@name)");
    const result = insert.run({ name: "first" });
    assert.equal(result.lastInsertRowid, 1);
    db.transaction(() => {
      insert.run({ name: "second" });
      insert.run({ name: "third" });
    })();
    assert.equal(db.prepare("SELECT COUNT(*) AS value FROM records").get()?.value, 3);
    db.close();

    const reopened = new SqlJsDatabase(filename);
    assert.deepEqual(
      reopened.prepare("SELECT name FROM records ORDER BY id").all(),
      [{ name: "first" }, { name: "second" }, { name: "third" }],
    );
    const reopenedInsert = reopened.prepare("INSERT INTO records (name) VALUES (?)");
    assert.throws(() => reopened.transaction(() => {
      reopenedInsert.run("rolled back");
      throw new Error("stop");
    })());
    assert.equal(reopened.prepare("SELECT COUNT(*) AS value FROM records").get()?.value, 3);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("portable database can adopt an external database", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "kks-sqlite-replace-"));
  try {
    const primaryFile = path.join(directory, "primary.db");
    const sourceFile = path.join(directory, "source.db");
    const primary = new SqlJsDatabase(primaryFile);
    primary.exec("CREATE TABLE records (value TEXT NOT NULL); INSERT INTO records VALUES ('old')");
    const source = new SqlJsDatabase(sourceFile);
    source.exec("CREATE TABLE records (value TEXT NOT NULL); INSERT INTO records VALUES ('recovered')");
    source.close();
    primary.replaceWithFile(sourceFile);
    assert.equal(primary.prepare("SELECT value FROM records").get()?.value, "recovered");
    primary.close();
    const reopened = new SqlJsDatabase(primaryFile);
    assert.equal(reopened.prepare("SELECT value FROM records").get()?.value, "recovered");
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
