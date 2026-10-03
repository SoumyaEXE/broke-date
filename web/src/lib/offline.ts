/* Live offline proof, measured by the browser itself (not a claim): every resource this page has loaded or fetched,
 * and whether any of them went anywhere other than this app or the local engine on 127.0.0.1. Plus the page's
 * network lock (Content-Security-Policy, built pages only) and any request that lock refused. */

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** URLs of requests that left this laptop (anything not same-origin, loopback, data: or blob:). */
export function outsideRequests(entries: { name: string }[] = performance.getEntriesByType("resource")): string[] {
  const own = typeof location !== "undefined" ? location.origin : "";
  return entries.map((e) => e.name).filter((u) => {
    try {
      const x = new URL(u, own || undefined);
      if (x.protocol === "data:" || x.protocol === "blob:") return false;
      return x.origin !== own && !LOCAL_HOSTS.has(x.hostname);
    } catch {
      return false;
    }
  });
}

export function requestCount(): number {
  return typeof performance !== "undefined" ? performance.getEntriesByType("resource").length : 0;
}

/** The page's network lock, if the build injected one. */
export function networkLock(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? null;
}

const blocked: string[] = [];
if (typeof document !== "undefined") {
  document.addEventListener("securitypolicyviolation", (e) => { blocked.push(e.blockedURI); });
}
/** Requests the network lock refused since the page opened (each one would have left the laptop). */
export function blockedRequests(): string[] { return [...blocked]; }
