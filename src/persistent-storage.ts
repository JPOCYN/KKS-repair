import { existsSync } from "node:fs";
import path from "node:path";

export function findPersistentPrivateDirectory(workingDirectory = process.cwd()): string | null {
  let current = path.resolve(workingDirectory);
  while (true) {
    const candidate = path.join(current, "public_html", "private-data");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
