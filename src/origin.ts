export interface WriteOriginCheck {
  production: boolean;
  configuredOrigins?: string;
  requestOrigin?: string;
  fetchSite?: string;
  requestReferer?: string;
}

export function isAllowedWriteOrigin({
  production,
  configuredOrigins,
  requestOrigin,
  fetchSite,
  requestReferer,
}: WriteOriginCheck): boolean {
  if (!production || !configuredOrigins || !requestOrigin) return true;

  const allowedOrigins = configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.includes(requestOrigin)) return true;

  if (requestOrigin !== "null" || fetchSite === "cross-site") return false;

  // The Codex in-app browser intentionally uses an opaque origin. Prefer its
  // browser-controlled Fetch Metadata, but also accept a same-origin Referer
  // because some hosting proxies remove Sec-Fetch-Site before Node receives it.
  if (fetchSite === "same-origin") return true;
  // The app's SameSite session cookie and per-session CSRF token still protect
  // authenticated writes when the proxy removes both proof headers.
  if (!requestReferer) return fetchSite === undefined;

  try {
    return allowedOrigins.includes(new URL(requestReferer).origin);
  } catch {
    return false;
  }
}
