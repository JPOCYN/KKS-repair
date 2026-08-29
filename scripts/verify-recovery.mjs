import initSqlJs from "sql.js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const project = path.resolve(".");
const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(path.join(project, "data/kks-repair.db")));
const rows = (sql) => {
  const statement = db.prepare(sql);
  const result = [];
  try {
    while (statement.step()) result.push(statement.getAsObject());
    return result;
  } finally {
    statement.free();
  }
};
const count = (sql) => Number(rows(sql)[0].value);
const counts = {
  brands: count("SELECT COUNT(*) AS value FROM brands"),
  vehicles: count("SELECT COUNT(*) AS value FROM cars"),
  members: count("SELECT COUNT(*) AS value FROM users WHERE role = 'customer'"),
  administrators: count("SELECT COUNT(*) AS value FROM users WHERE role = 'admin'"),
  authorizationCodes: count("SELECT COUNT(*) AS value FROM authorization_codes"),
  menuRows: count("SELECT COUNT(*) AS value FROM manual_menu"),
  linkedRows: count("SELECT COUNT(*) AS value FROM manual_menu WHERE relative_file IS NOT NULL"),
};
const documents = rows(`
  SELECT DISTINCT c.folder_name, m.relative_file
  FROM manual_menu m
  JOIN cars c ON c.id = m.car_id
  WHERE m.relative_file IS NOT NULL
`);
const missingDocuments = documents.filter((row) => !existsSync(path.join(project, "manuals", row.folder_name, "html", row.relative_file)));
db.close();

let manualFiles = 0;
let manualBytes = 0;
let partialFiles = 0;
const pending = [path.join(project, "manuals")];
while (pending.length > 0) {
  const directory = pending.pop();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) pending.push(target);
    else if (entry.isFile()) {
      manualFiles += 1;
      manualBytes += statSync(target).size;
      if (entry.name.endsWith(".part")) partialFiles += 1;
    }
  }
}

const result = {
  counts,
  uniqueIndexedDocuments: documents.length,
  missingIndexedDocuments: missingDocuments.length,
  manualFiles,
  manualBytes,
  partialFiles,
  passed: missingDocuments.length === 0 && partialFiles === 0,
};
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
