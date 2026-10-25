/**
 * Best-effort rate limit for /api/collect: a fixed window per key, held in the worker's memory only.
 * The key (the connecting IP) is never written anywhere and is forgotten when the window ends or the
 * worker restarts. Each Cloudflare location runs its own copy, so this stops floods from one client;
 * the WAF rate-limiting rule in docs/METRICS.md is the hard limit.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }: { limit: number; windowMs: number; maxKeys?: number; now?: () => number }) {
  const windows = new Map<string, { start: number; count: number }>();
  return function allow(key: string): boolean {
    const t = now();
    const w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      // Bound memory: when full, drop every expired window, and if still full, start over.
      if (!w && windows.size >= maxKeys) {
        for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k);
        if (windows.size >= maxKeys) windows.clear();
      }
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  };
}
