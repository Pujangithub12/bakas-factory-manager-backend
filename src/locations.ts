// Where a phone was when its user did something in the app. A phone sends only its own person's readings;
// only the Owner reads them, on the laptop. They never go to the phones in /sync/pull.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "./prisma";
import { requireAuth, requireRole } from "./auth";

export const locationRouter = Router();

/** Setting the Owner keeps: the factory's spot and how far from it still counts as at the factory. */
export const FACTORY_KEY = "factory_location";

/** Checks the factory spot the Owner saves. Returns why it is refused, or null. */
export function factoryError(v: unknown): string | null {
  const ok = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), radius_m: z.number().int().min(50).max(20_000) }).strict().safeParse(v);
  return ok.success ? null : "Bad factory location";
}

const DAY = 86_400_000;
const Ping = z.object({
  id: z.uuid(),
  at: z.iso.datetime({ offset: true }),
  action: z.string().trim().min(1).max(60),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracy_m: z.number().min(0).max(1_000_000).nullable(),
  note: z.string().max(200).nullable(),
});
const Batch = z.object({ pings: z.array(Ping).min(1).max(200) });

locationRouter.post("/location/batch", requireAuth, async (req, res) => {
  const body = Batch.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Bad location data" });
  const now = Date.now();
  const rows = body.data.pings
    // A reading from the future, or more than two weeks old (a phone long offline), is dropped.
    .filter((p) => { const t = Date.parse(p.at); return t <= now + 5 * 60_000 && t >= now - 14 * DAY; })
    .map((p) => {
      const has = p.lat != null && p.lng != null;
      return {
        id: p.id,
        person_id: req.auth!.id, // always the signed-in person, whatever the phone sent
        at: new Date(p.at),
        action: p.action,
        lat: has ? p.lat : null,
        lng: has ? p.lng : null,
        accuracy_m: has && p.accuracy_m != null ? Math.round(p.accuracy_m) : null,
        note: has ? null : p.note,
        received_at: new Date(now),
      };
    });
  // A batch sent again after a lost reply is kept once (same ids).
  if (rows.length) await prisma.location_ping.createMany({ data: rows, skipDuplicates: true });
  res.json({ ok: true, saved: rows.length });
});

locationRouter.get("/admin/locations", requireAuth, requireRole("Owner"), async (req, res) => {
  const from = new Date(String(req.query.from ?? ""));
  const to = new Date(String(req.query.to ?? ""));
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 32 * DAY) {
    return res.status(400).json({ error: "Choose up to a month" });
  }
  const pings = await prisma.location_ping.findMany({
    where: { at: { gte: from, lt: to } },
    orderBy: { at: "desc" },
    take: 20_000,
  });
  res.json({ pings: pings.map((p) => ({ ...p, lat: p.lat == null ? null : Number(p.lat), lng: p.lng == null ? null : Number(p.lng) })) });
});
