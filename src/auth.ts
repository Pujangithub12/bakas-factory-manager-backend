import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "./prisma";
import { canManage } from "./roles";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET is not set in .env");

export type Auth = { id: string; name: string; roles: string[] };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: Auth;
    }
  }
}

export const MANAGEMENT = ["Owner", "Manager", "Supervisor"];

/** The person in charge of the current shift gets the supervisor screens. */
async function inChargeNow(personId: string): Promise<boolean> {
  const from = new Date(Date.now() - 12 * 3600_000);
  const row = await prisma.shift_in_charge.findFirst({
    where: { person_id: personId, shift_start: { gte: from, lte: new Date() } },
    select: { shift_start: true },
  });
  return !!row;
}

export async function loadAuth(personId: string): Promise<Auth | null> {
  const p = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, full_name: true, active: true, person_role_person_id_back: { select: { role: true } } },
  });
  if (!p || !p.active) return null;
  const roles = p.person_role_person_id_back.map((r) => r.role);
  if (!roles.includes("Supervisor") && (await inChargeNow(p.id))) roles.push("Supervisor");
  return { id: p.id, name: p.full_name, roles };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  if (!m) return res.status(401).json({ error: "Sign in required" });
  try {
    const { sub } = jwt.verify(m[1], SECRET!) as { sub: string };
    const auth = await loadAuth(sub);
    if (!auth) return res.status(401).json({ error: "Account is inactive" });
    req.auth = auth;
    next();
  } catch {
    res.status(401).json({ error: "Session expired, sign in again" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth?.roles.some((r) => roles.includes(r))) return res.status(403).json({ error: "Not allowed" });
    next();
  };
}

// PINs are 6 digits. Even so, lock a person out after repeated wrong tries.
export const PIN_LENGTH = 6;
const PIN_RE = new RegExp(`^\\d{${PIN_LENGTH}}$`);

/** Obvious PINs people should not pick: 000000, 777777, 123456, 654321. */
export function weakPin(pin: string): string | null {
  if (/^(\d)\1+$/.test(pin)) return "Choose a PIN that is not all the same digit";
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return "Choose a PIN that is not a run of numbers like 123456";
  return null;
}
const MAX_TRIES = 5;
const LOCK_MS = 15 * 60_000;
const tries = new Map<string, { n: number; until: number }>();

export const authRouter = Router();

/** Is this a brand new install with no Owner yet? The apps show the first-run setup when it is. */
authRouter.get("/auth/status", async (_req, res) => {
  const owner = await prisma.person_role.findFirst({ where: { role: "Owner" }, select: { person_id: true } });
  res.json({ setup_needed: !owner, pin_length: PIN_LENGTH });
});

/** First run only: create the one Owner (the super admin) with a PIN, and sign them in. Refused once an Owner exists. */
authRouter.post("/auth/setup", async (req, res) => {
  const body = z.object({ full_name: z.string().trim().min(2).max(80), pin: z.string().regex(PIN_RE) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: `Enter your name and a ${PIN_LENGTH}-digit PIN` });
  const weak = weakPin(body.data.pin);
  if (weak) return res.status(400).json({ error: weak });
  const pin_hash = await bcrypt.hash(body.data.pin, 10);
  const full_name = body.data.full_name.replace(/\s+/g, " ");
  try {
    const id = await prisma.$transaction(
      async (tx) => {
        if (await tx.person_role.findFirst({ where: { role: "Owner" } })) throw new Error("exists");
        const now = new Date();
        const p = await tx.person.create({ data: { full_name, pin_hash, active: true, checked: true, checked_at: now } });
        await tx.person_role.create({ data: { person_id: p.id, role: "Owner", is_main: true } });
        await tx.audit_log.create({ data: { table_name: "person", record_id: p.id, action: "insert", new_values: { full_name, role: "Owner" }, by: p.id, at: now } });
        return p.id;
      },
      { isolationLevel: "Serializable" }
    );
    const auth = await loadAuth(id);
    const token = jwt.sign({ sub: id }, SECRET!, { expiresIn: "30d" });
    res.json({ token, person: { id: auth!.id, full_name: auth!.name }, roles: auth!.roles });
  } catch (e) {
    if (e instanceof Error && e.message === "exists") return res.status(409).json({ error: "The Owner is already set up. Sign in instead." });
    console.error(e);
    res.status(500).json({ error: "Could not set up the Owner" });
  }
});

/** Names (and what they do) to pick from on the sign-in screen. Active people with a PIN only. */
authRouter.get("/auth/people", async (_req, res) => {
  const people = await prisma.person.findMany({
    where: { active: true, pin_hash: { not: null } },
    select: { id: true, full_name: true, person_role_person_id_back: { select: { role: true, is_main: true } } },
    orderBy: { full_name: "asc" },
  });
  res.json(
    people.map((p) => {
      const rs = p.person_role_person_id_back;
      return { id: p.id, full_name: p.full_name, role: (rs.find((r) => r.is_main) ?? rs[0])?.role ?? null, roles: rs.map((r) => r.role) };
    })
  );
});

authRouter.post("/auth/login", async (req, res) => {
  const body = z.object({ person_id: z.string().uuid(), pin: z.string().regex(PIN_RE) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: `Enter your ${PIN_LENGTH}-digit PIN` });
  const { person_id, pin } = body.data;

  const t = tries.get(person_id);
  if (t && t.until > Date.now()) return res.status(429).json({ error: "Too many wrong tries. Wait 15 minutes." });

  const p = await prisma.person.findUnique({ where: { id: person_id }, select: { pin_hash: true, active: true } });
  const ok = !!p?.active && !!p.pin_hash && (await bcrypt.compare(pin, p.pin_hash));
  if (!ok) {
    // Start counting again only after a lockout has run out (until === 0 means "not locked").
    const lockoutOver = !!t && t.until !== 0 && t.until <= Date.now();
    const n = (lockoutOver ? 0 : t?.n ?? 0) + 1;
    tries.set(person_id, { n, until: n >= MAX_TRIES ? Date.now() + LOCK_MS : 0 });
    return res.status(401).json({ error: "Wrong PIN" });
  }
  tries.delete(person_id);

  const auth = await loadAuth(person_id);
  const token = jwt.sign({ sub: person_id }, SECRET!, { expiresIn: "30d" });
  res.json({ token, person: { id: auth!.id, full_name: auth!.name }, roles: auth!.roles });
});

/** Set or reset someone's PIN. */
authRouter.post("/people/:id/pin", requireAuth, requireRole(...MANAGEMENT), async (req, res) => {
  const body = z.object({ pin: z.string().regex(PIN_RE) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: `PIN must be ${PIN_LENGTH} digits` });
  const weak = weakPin(body.data.pin);
  if (weak) return res.status(400).json({ error: weak });
  const id = String(req.params.id);
  const old = await prisma.person.findUnique({ where: { id }, select: { id: true, person_role_person_id_back: { select: { role: true } } } });
  if (!old) return res.status(404).json({ error: "Person not found" });
  // You can set your own PIN; otherwise only someone who outranks the person (or the Owner) can.
  if (!canManage(req.auth!.id, req.auth!.roles, id, old.person_role_person_id_back.map((r) => r.role))) {
    return res.status(403).json({ error: "You cannot set the PIN of someone with a higher role" });
  }
  await prisma.$transaction([
    prisma.person.update({ where: { id }, data: { pin_hash: await bcrypt.hash(body.data.pin, 10) } }),
    // The hash itself is not copied into the log.
    prisma.audit_log.create({
      data: { table_name: "person", record_id: id, action: "update", new_values: { pin: "changed" }, by: req.auth!.id, at: new Date() },
    }),
  ]);
  res.json({ ok: true });
});
