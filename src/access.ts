export interface LibraryAccessUser {
  role: "admin" | "customer";
  vipStatus: boolean;
  vipExpiresAt: string | null;
}

function normalizedExpiry(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
}

export function hasLibraryAccess(user: LibraryAccessUser, now = Date.now()): boolean {
  if (user.role === "admin") return true;
  if (!user.vipStatus) return false;
  if (!user.vipExpiresAt) return true;
  const expiry = Date.parse(normalizedExpiry(user.vipExpiresAt));
  return Number.isFinite(expiry) && expiry > now;
}

export function libraryAccessState(user: LibraryAccessUser, now = Date.now()): "active" | "inactive" | "expired" {
  if (hasLibraryAccess(user, now)) return "active";
  if (!user.vipStatus) return "inactive";
  return "expired";
}
