// Guarded service worker registration for the published PWA only.
// Never registers in dev, iframes, or Lovable preview/editor hosts.
const SW_PATH = "/sw.js";

function shouldSkip(): boolean {
  if (typeof window === "undefined") return true;
  if (!("serviceWorker" in navigator)) return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(window.location.search).has("sw")) {
    if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  }
  return false;
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  if (shouldSkip()) {
    // Unregister any stale worker if guards apply (e.g. viewing preview).
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.filter((r) => r.active?.scriptURL.endsWith(SW_PATH)).map((r) => r.unregister()),
      );
    } catch {}
    return;
  }

  try {
    await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  } catch (err) {
    console.warn("[sw] registration failed", err);
  }
}
