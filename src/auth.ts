import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "./prisma";
import { canManage } from "./roles";
import { publicUrl, sendMail } from "./mail";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET is not set in .env");

export type Auth = { id: string; name: string; roles: string[]; tv: number };

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
    select: { id: true, full_name: true, active: true, token_version: true, person_role_person_id_back: { select: { role: true } } },
  });
  if (!p || !p.active) return null;
  const roles = p.person_role_person_id_back.map((r) => r.role);
  if (!roles.includes("Supervisor") && (await inChargeNow(p.id))) roles.push("Supervisor");
  return { id: p.id, name: p.full_name, roles, tv: p.token_version };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  if (!m) return res.status(401).json({ error: "Sign in required" });
  try {
    const { sub, tv } = jwt.verify(m[1], SECRET!) as { sub: string; tv?: number };
    const auth = await loadAuth(sub);
    if (!auth) return res.status(401).json({ error: "Account is inactive" });
    // A PIN change raises token_version, which ends every session signed in before it.
    if ((tv ?? 0) !== auth.tv) return res.status(401).json({ error: "Your PIN was changed. Sign in again" });
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

// PINs are 6 digits. Even so, lock out repeated wrong tries.
export const PIN_LENGTH = 6;
/** An email address, lower case; empty means none. */
const EMAIL = z.string().trim().toLowerCase().max(120).pipe(z.union([z.literal(""), z.string().email()]));
const PIN_RE = new RegExp(`^\\d{${PIN_LENGTH}}$`);

/** Only the plainest run of numbers is refused (123456, 654321). Repeated digits such as 222222 are allowed. */
export function weakPin(pin: string): string | null {
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
  const body = z.object({ full_name: z.string().trim().min(2).max(80), pin: z.string().regex(PIN_RE), email: EMAIL.optional() }).safeParse(req.body);
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
        const p = await tx.person.create({ data: { full_name, pin_hash, email: body.data.email || null, active: true, checked: true, checked_at: now } });
        await tx.person_role.create({ data: { person_id: p.id, role: "Owner", is_main: true } });
        await tx.audit_log.create({ data: { table_name: "person", record_id: p.id, action: "insert", new_values: { full_name, role: "Owner" }, by: p.id, at: now } });
        return p.id;
      },
      { isolationLevel: "Serializable" }
    );
    const auth = await loadAuth(id);
    const token = jwt.sign({ sub: id, tv: auth!.tv }, SECRET!, { expiresIn: "30d" });
    res.json({ token, person: { id: auth!.id, full_name: auth!.name }, roles: auth!.roles });
  } catch (e) {
    if (e instanceof Error && e.message === "exists") return res.status(409).json({ error: "The Owner is already set up. Sign in instead." });
    console.error(e);
    res.status(500).json({ error: "Could not set up the Owner" });
  }
});

/** The roles shown on the sign-in page, in order. Helper is a worker role with no sign-in. */
export const SIGN_IN_ROLES = ["Owner", "Manager", "Operator", "Driver", "Security", "Supervisor", "Fitter", "Store", "Weighbridge"] as const;

/** The sign-in page: each role, and how many active people can sign in as it. */
authRouter.get("/auth/roles", async (_req, res) => {
  const rows = await prisma.person_role.findMany({
    where: { person_id_rel: { active: true, pin_hash: { not: null } } },
    select: { role: true, person_id: true },
  });
  res.json({ roles: SIGN_IN_ROLES.map((role) => ({ role, count: new Set(rows.filter((r) => r.role === role).map((r) => r.person_id)).size })) });
});

/** Names (and what they do). Kept for tools; the apps sign in by role. */
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

type Counter = { n: number; until: number };
const isLocked = (m: Map<string, Counter>, k: string) => (m.get(k)?.until ?? 0) > Date.now();
function registerFailure(m: Map<string, Counter>, k: string, max: number) {
  const t = m.get(k);
  // Start counting again only after a lockout has run out (until === 0 means "not locked").
  const over = !!t && t.until !== 0 && t.until <= Date.now();
  const n = (over ? 0 : t?.n ?? 0) + 1;
  m.set(k, { n, until: n >= max ? Date.now() + LOCK_MS : 0 });
}
const byClient = new Map<string, Counter>(); // one phone trying one role: 5 wrong PINs
const byTarget = new Map<string, Counter>(); // anyone trying one role: 25 wrong PINs, so one phone cannot lock the Owner out for long

/** Is this PIN already someone's? PINs are unique, because sign-in finds the person from the role and the PIN. */
export async function pinInUse(pin: string, exceptId?: string): Promise<boolean> {
  const others = await prisma.person.findMany({
    where: { pin_hash: { not: null }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { pin_hash: true },
  });
  for (const o of others) if (await bcrypt.compare(pin, o.pin_hash!)) return true;
  return false;
}

/** Sign in with a role and a PIN: the person is the one holding that role whose PIN this is. */
authRouter.post("/auth/login", async (req, res) => {
  const body = z.object({ pin: z.string().regex(PIN_RE), role: z.string().optional(), person_id: z.string().uuid().optional() }).safeParse(req.body);
  if (!body.success || (!body.data.role && !body.data.person_id)) return res.status(400).json({ error: `Enter your ${PIN_LENGTH}-digit PIN` });
  const { role, person_id, pin } = body.data;
  if (role && !(SIGN_IN_ROLES as readonly string[]).includes(role)) return res.status(400).json({ error: "Choose a role to sign in as" });

  const target = role ?? person_id!;
  const clientKey = `${req.ip}|${target}`;
  if (isLocked(byClient, clientKey) || isLocked(byTarget, target)) return res.status(429).json({ error: "Too many wrong tries. Wait 15 minutes." });

  const people = await prisma.person.findMany({
    where: { active: true, pin_hash: { not: null }, ...(person_id ? { id: person_id } : { person_role_person_id_back: { some: { role } } }) },
    select: { id: true, pin_hash: true },
  });
  let found: string | null = null;
  for (const p of people) {
    if (await bcrypt.compare(pin, p.pin_hash!)) { found = p.id; break; }
  }
  if (!found) {
    registerFailure(byClient, clientKey, MAX_TRIES);
    registerFailure(byTarget, target, 25);
    return res.status(401).json({ error: "Wrong PIN" });
  }
  byClient.delete(clientKey);

  const auth = await loadAuth(found);
  const token = jwt.sign({ sub: found, tv: auth!.tv }, SECRET!, { expiresIn: "30d" });
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
  if (await pinInUse(body.data.pin, id)) return res.status(409).json({ error: "That PIN is already used by someone else. Choose another." });
  await prisma.$transaction([
    prisma.person.update({ where: { id }, data: { pin_hash: await bcrypt.hash(body.data.pin, 10), token_version: { increment: 1 } } }),
    // The hash itself is not copied into the log.
    prisma.audit_log.create({
      data: { table_name: "person", record_id: id, action: "update", new_values: { pin: "changed" }, by: req.auth!.id, at: new Date() },
    }),
  ]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------------------------
// Forgot PIN: email a one-time link, then set a new PIN.
// ---------------------------------------------------------------------------------------------
const RESET_MINUTES = 20;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const forgotByIp = new Map<string, { n: number; start: number }>();
const forgotByEmail = new Map<string, { n: number; start: number }>();
/** At most `max` in an hour. Returns true when this one is over the limit. */
function overLimit(m: Map<string, { n: number; start: number }>, k: string, max: number): boolean {
  const now = Date.now();
  const t = m.get(k);
  if (!t || now - t.start > 3_600_000) { m.set(k, { n: 1, start: now }); return false; }
  t.n += 1;
  return t.n > max;
}

/** The same answer whether or not the address belongs to an account, so nobody can use this to find out who has one. */
const FORGOT_REPLY = { message: "If that account exists, we have sent a link to reset the PIN." };

authRouter.post("/auth/forgot", async (req, res) => {
  const body = z.object({ email: EMAIL.refine((e) => e !== "") }).safeParse(req.body);
  // A badly formed address gets the same reply too, and the work below happens after the reply, so the time taken tells nothing.
  res.json(FORGOT_REPLY);
  if (!body.success) return;
  const email = body.data.email;
  // Too many asks from one place, or for one address, are ignored quietly (still the same reply).
  if (overLimit(forgotByIp, req.ip ?? "?", 10) || overLimit(forgotByEmail, email, 3)) return;
  try {
    const p = await prisma.person.findUnique({ where: { email }, select: { id: true, full_name: true, active: true, pin_hash: true } });
    if (!p || !p.active || !p.pin_hash) return;
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await prisma.$transaction([
      // Only the newest link works.
      prisma.pin_reset.updateMany({ where: { person_id: p.id, used_at: null }, data: { used_at: now } }),
      prisma.pin_reset.create({ data: { person_id: p.id, token_hash: sha256(token), expires_at: new Date(now.getTime() + RESET_MINUTES * 60_000), created_at: now } }),
      prisma.audit_log.create({ data: { table_name: "person", record_id: p.id, action: "update", new_values: { pin_reset: "requested" }, by: p.id, at: now } }),
    ]);
    await sendMail(
      email,
      "Reset your Bakas Factory PIN",
      `Hello ${p.full_name},\n\nSomeone asked to reset the PIN for your Bakas Factory account. To choose a new PIN, open this link within ${RESET_MINUTES} minutes (it works once):\n\n${publicUrl()}/reset?token=${token}\n\nIf you did not ask for this, ignore this email. Your PIN has not changed.\n`
    );
  } catch (e) {
    console.error("forgot PIN failed", e instanceof Error ? e.message : e);
  }
});

/** Set the new PIN with the emailed token. The token dies, and every session signed in before now is signed out. */
authRouter.post("/auth/reset", async (req, res) => {
  const body = z.object({ token: z.string().regex(TOKEN_RE), pin: z.string().regex(PIN_RE) }).safeParse(req.body);
  const BAD = "This link has expired or was already used. Ask for a new one.";
  if (!body.success) return res.status(400).json({ error: `Enter a ${PIN_LENGTH}-digit PIN` });
  if (overLimit(forgotByIp, `reset|${req.ip}`, 20)) return res.status(429).json({ error: "Too many tries. Wait a while." });
  const row = await prisma.pin_reset.findUnique({ where: { token_hash: sha256(body.data.token) } });
  if (!row || row.used_at || row.expires_at.getTime() < Date.now()) return res.status(400).json({ error: BAD });
  const person = await prisma.person.findUnique({ where: { id: row.person_id }, select: { id: true, active: true, email: true, full_name: true } });
  if (!person || !person.active) return res.status(400).json({ error: BAD });
  const weak = weakPin(body.data.pin);
  if (weak) return res.status(400).json({ error: weak });
  if (await pinInUse(body.data.pin, person.id)) return res.status(409).json({ error: "That PIN is already used by someone else. Choose another." });
  const pin_hash = await bcrypt.hash(body.data.pin, 10);
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      // Single use: only the request that flips used_at from empty gets through.
      const used = await tx.pin_reset.updateMany({ where: { id: row.id, used_at: null, expires_at: { gt: now } }, data: { used_at: now } });
      if (used.count !== 1) throw new Error("used");
      await tx.pin_reset.updateMany({ where: { person_id: person.id, used_at: null }, data: { used_at: now } });
      await tx.person.update({ where: { id: person.id }, data: { pin_hash, token_version: { increment: 1 } } });
      await tx.audit_log.create({ data: { table_name: "person", record_id: person.id, action: "update", new_values: { pin: "reset by email" }, by: person.id, at: now } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "used") return res.status(400).json({ error: BAD });
    console.error(e);
    return res.status(500).json({ error: "Could not set the PIN" });
  }
  res.json({ ok: true });
  if (person.email) {
    sendMail(
      person.email,
      "Your Bakas Factory PIN was changed",
      `Hello ${person.full_name},\n\nThe PIN for your Bakas Factory account was just changed, and you have been signed out everywhere.\n\nIf this was you, there is nothing to do. If it was not, tell the Owner at once.\n`
    ).catch((e) => console.error("mail failed", e instanceof Error ? e.message : e));
  }
});

/** The page the emailed link opens, in any browser. It also offers to continue in the phone app. */
authRouter.get("/reset", (req, res) => {
  const token = typeof req.query.token === "string" && TOKEN_RE.test(req.query.token) ? req.query.token : "";
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
  });
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset PIN</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f4ef;margin:0;padding:24px;color:#1d2a22}main{max-width:380px;margin:8vh auto;background:#fff;border:1px solid #d9d5cc;border-radius:18px;padding:24px}
h1{margin:0 0 6px;font-size:26px}p{color:#5b6760;line-height:1.45}input{width:100%;box-sizing:border-box;font-size:22px;letter-spacing:6px;text-align:center;padding:12px;margin:6px 0 14px;border:1px solid #d9d5cc;border-radius:12px}
button,a.b{display:block;width:100%;box-sizing:border-box;text-align:center;font-size:17px;font-weight:700;padding:14px;border:0;border-radius:12px;background:#2f6b3f;color:#fff;text-decoration:none}a.b{background:#fff;color:#2f6b3f;border:1px solid #2f6b3f;margin-top:12px}#m{min-height:22px;color:#b3261e}#m.ok{color:#2f6b3f}</style></head><body><main>
${token ? `<h1>Choose a new PIN</h1><p>Enter a ${PIN_LENGTH}-digit PIN. This link works once.</p>
<form id="f"><label>New PIN<input id="a" type="password" inputmode="numeric" autocomplete="new-password" maxlength="${PIN_LENGTH}"></label><label>Enter it again<input id="b" type="password" inputmode="numeric" autocomplete="new-password" maxlength="${PIN_LENGTH}"></label><div id="m"></div><button id="go" type="submit">Save new PIN</button></form>
<a class="b" id="app" href="#">Open in the Bakas app</a>`
  : `<h1>Link not valid</h1><p>This link is not complete. Ask for a new reset email from the sign-in screen.</p>`}
</main>
<script>
var T=${JSON.stringify(token)};
if(T){
var m=document.getElementById('m');
document.getElementById('app').href='bakas://reset?token='+encodeURIComponent(T);
document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();
 var a=document.getElementById('a').value,b=document.getElementById('b').value;
 if(!/^[0-9]{${PIN_LENGTH}}$/.test(a)){m.className='';m.textContent='The PIN is ${PIN_LENGTH} digits.';return}
 if(a!==b){m.className='';m.textContent='The two PINs do not match.';return}
 document.getElementById('go').disabled=true;
 fetch('/auth/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:T,pin:a})})
  .then(function(r){return r.json().then(function(j){return[r.ok,j]})})
  .then(function(x){if(x[0]){m.className='ok';m.textContent='Your PIN is changed. You can sign in with it now.';document.getElementById('f').style.display='none'}else{m.className='';m.textContent=x[1].error||'Could not save';document.getElementById('go').disabled=false}})
  .catch(function(){m.className='';m.textContent='Cannot reach the server.';document.getElementById('go').disabled=false});
});}
</script></body></html>`);
});

/** Emails on file (Owner and Managers only), so the Users page can show and change them. */
authRouter.get("/people/emails", requireAuth, requireRole("Owner", "Manager"), async (_req, res) => {
  const rows = await prisma.person.findMany({ where: { email: { not: null } }, select: { id: true, email: true } });
  res.json(rows);
});

/** Set or clear the email used for PIN reset. */
authRouter.post("/people/:id/email", requireAuth, requireRole(...MANAGEMENT), async (req, res) => {
  const body = z.object({ email: EMAIL }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "That does not look like an email address" });
  const id = String(req.params.id);
  const old = await prisma.person.findUnique({ where: { id }, select: { id: true, person_role_person_id_back: { select: { role: true } } } });
  if (!old) return res.status(404).json({ error: "Person not found" });
  if (!canManage(req.auth!.id, req.auth!.roles, id, old.person_role_person_id_back.map((r) => r.role))) {
    return res.status(403).json({ error: "You cannot change the email of someone with a higher role" });
  }
  const email = body.data.email || null;
  if (email && (await prisma.person.findFirst({ where: { email, NOT: { id } }, select: { id: true } }))) {
    return res.status(409).json({ error: "That email is already used by someone else" });
  }
  await prisma.$transaction([
    prisma.person.update({ where: { id }, data: { email } }),
    prisma.audit_log.create({ data: { table_name: "person", record_id: id, action: "update", new_values: { email: email ? "changed" : "removed" }, by: req.auth!.id, at: new Date() } }),
  ]);
  res.json({ ok: true });
});
