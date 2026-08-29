import { readFileSync } from "node:fs";
import path from "node:path";
import {
  importRecoveredCodes,
  importRecoveredManuals,
  importRecoveredMembers,
  initializeDatabase,
  type RecoveredCode,
  type RecoveredManual,
  type RecoveredMember,
} from "./db.js";

const privateDirectory = path.resolve(process.argv[2] || process.env.RECOVERY_PRIVATE_DIR || "recovery/private");
const members = JSON.parse(readFileSync(path.join(privateDirectory, "members.json"), "utf8")) as RecoveredMember[];
const codes = JSON.parse(readFileSync(path.join(privateDirectory, "authorization-codes.json"), "utf8")) as RecoveredCode[];
const manualData = JSON.parse(readFileSync(path.resolve("recovery/catalog/manual-menus.json"), "utf8")) as { manuals: RecoveredManual[] };
const db = initializeDatabase();

const memberCount = importRecoveredMembers(db, members);
const codeCount = importRecoveredCodes(db, codes);
const manualCount = importRecoveredManuals(db, manualData.manuals);
console.log(JSON.stringify({ memberCount, codeCount, manualCount, database: db.name }, null, 2));
db.close();
