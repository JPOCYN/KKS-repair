import { existsSync } from "node:fs";
import path from "node:path";

function configuredHostname(publicOrigin: string | undefined): string | null {
  if (!publicOrigin) return null;
  try {
    return new URL(publicOrigin).hostname;
  } catch {
    return null;
  }
}

export function findPersistentPrivateDirectory(
  workingDirectory = process.cwd(),
  publicOrigin = process.env.PUBLIC_ORIGIN,
): string | null {
  const hostname = configuredHostname(publicOrigin);
  let current = path.resolve(workingDirectory);
  while (true) {
    const candidates = [path.join(current, "public_html", "private-data")];
    if (hostname) candidates.push(path.join(current, "domains", hostname, "public_html", "private-data"));
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found) return found;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
