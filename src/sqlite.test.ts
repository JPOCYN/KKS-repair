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
