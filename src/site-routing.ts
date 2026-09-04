const appPathPrefixes = ["/login", "/register", "/access", "/account", "/vehicles", "/admin", "/manuals", "/modern-manuals", "/internal", "/logout"];
const publicPathPrefixes = ["/privacy", "/terms", "/contact", "/guides", "/repair-manuals", "/tools", "/sitemap.xml"];

function normalizedOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isApplicationPath(pathname: string): boolean {
  return appPathPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isPublicContentPath(pathname: string): boolean {
  return publicPathPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function splitSiteRedirect(input: {
  hostname: string;
  method: string;
  originalUrl: string;
  publicOrigin: string | undefined;
  appOrigin: string | undefined;
}): string | null {
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  const publicSite = normalizedOrigin(input.publicOrigin);
  const appSite = normalizedOrigin(input.appOrigin);
  if (!publicSite || !appSite || publicSite.origin === appSite.origin) return null;

  const pathname = new URL(input.originalUrl, "http://request.local").pathname;
  const hostname = input.hostname.toLowerCase();
  if (hostname === publicSite.hostname.toLowerCase() && isApplicationPath(pathname)) {
    return new URL(input.originalUrl, appSite).toString();
  }
  if (hostname === appSite.hostname.toLowerCase() && isPublicContentPath(pathname)) {
    return new URL(input.originalUrl, publicSite).toString();
  }
  return null;
}

export function isPublicHostname(hostname: string, publicOrigin: string | undefined, appOrigin: string | undefined): boolean {
  const publicSite = normalizedOrigin(publicOrigin);
  const appSite = normalizedOrigin(appOrigin);
  return Boolean(publicSite && appSite && publicSite.origin !== appSite.origin && hostname.toLowerCase() === publicSite.hostname.toLowerCase());
}

export function isAppHostname(hostname: string, appOrigin: string | undefined, publicOrigin: string | undefined): boolean {
  const appSite = normalizedOrigin(appOrigin);
  const publicSite = normalizedOrigin(publicOrigin);
  return Boolean(appSite && publicSite && appSite.origin !== publicSite.origin && hostname.toLowerCase() === appSite.hostname.toLowerCase());
}
