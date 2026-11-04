import type { NextFunction, Request, Response } from "express";

/**
 * Counters kept in memory (one server process). They reset when the server restarts, which is fine for
 * slowing down guessing and floods; it is not a record of anything.
 *
 * Every counter lives only as long as its window. A sweeper drops the finished ones, and a hard cap stops a
 * flood of made-up keys (for example random person ids) from growing memory without limit.
 */
const MAX_KEYS = 20_000;

export class Counters {
  private m = new Map<string, { n: number; start: number; until: number }>();
  constructor(private windowMs: number) {
    const t = setInterval(() => this.sweep(), 60_000);
    t.unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.m) if (now - v.start > this.windowMs && v.until <= now) this.m.delete(k);
  }

  private fresh(k: string) {
    const now = Date.now();
    const t = this.m.get(k);
    if (t && now - t.start <= this.windowMs) return t;
    // Full: forget the oldest rather than grow. (Not a sweep: scanning everything on each new key would let a flood burn the CPU.)
    if (!t && this.m.size >= MAX_KEYS) this.m.delete(this.m.keys().next().value as string);
    const n = { n: 0, start: now, until: t && t.until > now ? t.until : 0 };
    this.m.set(k, n);
    return n;
  }

  /** Counts one hit and returns true when this one is over `max` inside the window. */
  hit(k: string, max: number): boolean {
    const t = this.fresh(k);
    t.n += 1;
    return t.n > max;
  }

  /** Counts one failure; after `max` of them the key is locked for `lockMs`. */
  fail(k: string, max: number, lockMs: number) {
    const t = this.fresh(k);
    t.n += 1;
    if (t.n >= max) t.until = Date.now() + lockMs;
  }

  locked(k: string): boolean {
    return (this.m.get(k)?.until ?? 0) > Date.now();
  }

  clear(k: string) {
    this.m.delete(k);
  }
}

/** At most `max` requests per minute from one address, for the whole API. */
export function rateLimit(max: number, windowMs = 60_000) {
  const c = new Counters(windowMs);
  return (req: Request, res: Response, next: NextFunction) => {
    if (c.hit(req.ip ?? "?", max)) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: "Too many requests. Wait a moment." });
    }
    next();
  };
}
