import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Prisma } from "./generated/prisma/client";
import { prisma } from "./prisma";
import { requireAuth, requireRole, MANAGEMENT } from "./auth";
import { canManage, isAdmin, roleChangeError } from "./roles";
import meta from "./meta.json";

type TableMeta = { phase: number; pk: string[]; cols: Record<string, { type: string; opt: boolean; fk?: string }> };
const TABLES = meta as unknown as Record<string, TableMeta>;

// ---------------------------------------------------------------- pull ----

// Lists every phone needs. Small, so they are sent whole each time.
const REFERENCE = [
  "person_role", "operator_machine", "shift", "machine", "stop_reason", "log_field",
  "material", "supplier", "buyer", "yard", "opening_stock",
] as const;

export const syncRouter = Router();
syncRouter.use(requireAuth);

syncRouter.get("/sync/pull", async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 3, 1), 400);
  const since = new Date(Date.now() - days * 86_400_000);
  const open = (col: string) => ({ [col]: null });

  const windowed: Record<string, object> = {
    attendance: { OR: [{ shift_start: { gte: since } }, open("gate_out")] },
    shift_in_charge: { shift_start: { gte: since } },
    machine_run: { OR: [{ started_at: { gte: since } }, open("stopped_at")] },
    run_helper: { run_id_rel: { OR: [{ started_at: { gte: since } }, open("stopped_at")] } },
    prestart_answer: { run_id_rel: { OR: [{ started_at: { gte: since } }, open("stopped_at")] } },
    run_bypass: { run_id_rel: { OR: [{ started_at: { gte: since } }, open("stopped_at")] } },
    downtime: { OR: [{ started_at: { gte: since } }, open("ended_at")] },
    log_reading: { at: { gte: since } },
    greasing_check: { at: { gte: since } },
    bag_count: { period_to: { gte: since } },
    yard_batch: { OR: [{ opened_at: { gte: since } }, open("finished_at")] },
    maintenance_job: { OR: [{ reported_at: { gte: since } }, open("fixed_at")] },
    weigh_ticket: { OR: [{ first_at: { gte: since } }, open("second_at")] },
  };

  const data: Record<string, unknown[]> = {};
  const db = prisma as unknown as Record<string, { findMany(a?: object): Promise<unknown[]> }>;
  await Promise.all([
    // pin_hash never leaves the server
    prisma.person.findMany({ omit: { pin_hash: true } }).then((r) => (data.person = r)),
    ...REFERENCE.map((t) => db[t].findMany().then((r) => (data[t] = r))),
    ...Object.entries(windowed).map(([t, where]) => db[t].findMany({ where }).then((r) => (data[t] = r))),
  ]);

  // Challan numbers restart each fiscal year (1 Shrawan, about 17 July). A phone only holds a few
  // days of tickets, so the server says where the numbering has reached.
  const now = new Date();
  let fyStart = new Date(Date.UTC(now.getUTCFullYear(), 6, 17));
  if (now < fyStart) fyStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 6, 17));
  const sold = await prisma.weigh_ticket.findMany({
    where: { direction: "out", challan_no: { not: null }, first_at: { gte: fyStart } },
    select: { challan_no: true },
  });
  let last: number | null = null;
  let prefix: string | null = null;
  for (const { challan_no } of sold) {
    const m = /^(.*?)(\d+)\s*$/.exec(challan_no ?? "");
    if (m && (last === null || Number(m[2]) > last)) {
      last = Number(m[2]);
      prefix = m[1];
    }
  }

  res.json({ server_time: now.toISOString(), me: req.auth, challan: { last, prefix, fy_start: fyStart.toISOString() }, tables: data });
});

// ---------------------------------------------------------------- push ----

const FIELD_STAFF = ["Operator", "Fitter"];
const GATE = ["Security"];
const WEIGH = ["Weighbridge"];
const STORE = ["Store"];

type Rule = { roles: string[]; del?: boolean };
/** Who may write each Phase 1 table from a phone. Owner/Manager/Supervisor can write all of them. */
const WRITE: Record<string, Rule> = {
  person: { roles: [...GATE] },
  person_role: { roles: [...GATE], del: true }, // a supervisor can correct a worker's role (see the delete check below)
  operator_machine: { roles: [], del: true },
  attendance: { roles: [...GATE] },
  shift_in_charge: { roles: [] },
  machine_run: { roles: [...FIELD_STAFF] },
  run_helper: { roles: [...FIELD_STAFF] },
  prestart_answer: { roles: [...FIELD_STAFF] },
  run_bypass: { roles: [...FIELD_STAFF] },
  downtime: { roles: [...FIELD_STAFF] },
  log_reading: { roles: [...FIELD_STAFF] },
  greasing_check: { roles: [...FIELD_STAFF] },
  bag_count: { roles: [...FIELD_STAFF, ...STORE, ...WEIGH] },
  yard_batch: { roles: [...FIELD_STAFF, ...WEIGH] },
  maintenance_job: { roles: [...FIELD_STAFF, ...GATE, ...WEIGH, ...STORE, "Driver"] }, // anyone can report a problem
  weigh_ticket: { roles: [...WEIGH] },
  supplier: { roles: [...WEIGH] },
  buyer: { roles: [...WEIGH] },
};

/** A column that records who did it. It must be the signed-in person, or unchanged. */
const WHO = new Set([
  "entered_by", "by", "gate_by", "on_duty_by", "registered_by", "checked_by", "set_by",
  "out_by", "started_by", "finished_by", "reported_by", "returned_by",
]);

const Op = z.object({
  table: z.string(),
  op: z.enum(["upsert", "delete"]),
  data: z.record(z.string(), z.unknown()),
});

class Reject extends Error {}

function whereOf(t: TableMeta, data: Record<string, unknown>) {
  for (const k of t.pk) if (data[k] == null) throw new Reject(`Missing ${k}`);
  if (t.pk.length === 1) return { [t.pk[0]]: toDb(t, t.pk[0], data[t.pk[0]]) };
  return { [t.pk.join("_")]: Object.fromEntries(t.pk.map((k) => [k, toDb(t, k, data[k])])) };
}

function toDb(t: TableMeta, col: string, v: unknown) {
  if (v == null) return null;
  const type = t.cols[col].type;
  if (type === "ts" || type === "date" || type === "time") {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) throw new Reject(`Bad date in ${col}`);
    return d;
  }
  return v;
}

function recordId(t: TableMeta, row: Record<string, unknown>): string {
  const isUuid = (c: string) => t.cols[c]?.type === "uuid" && typeof row[c] === "string";
  const col = ["id", ...t.pk.filter(isUuid), ...Object.keys(t.cols).filter(isUuid)].find((c) => isUuid(c));
  if (!col) throw new Reject("No id to log");
  return row[col] as string;
}

const plain = (o: unknown) => (o == null ? undefined : (JSON.parse(JSON.stringify(o)) as Prisma.InputJsonValue));

/** Setup lists: only management edits these, from the laptop. */
const SETUP = new Set(["shift", "machine", "stop_reason", "log_field", "material", "yard", "opening_stock"]);
/** The only rows that may be removed: a tick or a role. Everything else is corrected, never deleted. */
const REMOVABLE = new Set(["person_role", "operator_machine"]);

async function applyOp(op: z.infer<typeof Op>, who: { id: string; roles: string[] }, admin = false) {
  const t = TABLES[op.table];
  const rule = WRITE[op.table];
  if (!t || (!rule && !(admin && SETUP.has(op.table)))) throw new Reject(`${op.table} cannot be changed from here`);
  // The admin route is already limited to Owner and Manager; it may correct any Phase 1 table.
  if (!admin && !who.roles.some((r) => MANAGEMENT.includes(r) || rule!.roles.includes(r))) throw new Reject("Not allowed");
  if (op.op === "delete" && !(rule?.del || (admin && REMOVABLE.has(op.table)))) throw new Reject("Nothing is deleted; correct it instead");
  // Giving or taking away a role: who may do it depends on the role (see roles.ts).
  if (op.table === "person_role") {
    const err = roleChangeError(who.roles, String(op.data.role));
    if (err) throw new Reject(err);
  }

  const unknown = Object.keys(op.data).filter((k) => !t.cols[k]);
  if (unknown.length) throw new Reject(`Unknown column ${unknown.join(", ")}`);
  if (op.table === "person" && "pin_hash" in op.data) throw new Reject("PIN is set from the PIN screen");

  const where = whereOf(t, op.data);

  await prisma.$transaction(async (tx) => {
    const d = (tx as unknown as Record<string, Record<string, (a: object) => Promise<Record<string, unknown> | null>>>)[op.table];
    const old = await d.findUnique({ where });

    const isMgmt = who.roles.some((r) => MANAGEMENT.includes(r));
    if (op.op === "delete") {
      if (!old) return;
      if (op.table === "person_role" && !isMgmt) throw new Reject("Only the supervisor can change roles");
      await d.delete({ where });
      await tx.audit_log.create({
        data: { table_name: op.table, record_id: recordId(t, old), action: "delete", old_values: plain(old), by: who.id, at: new Date() },
      });
      return;
    }

    if (!isMgmt && old && (op.table === "person" || op.table === "person_role")) {
      throw new Reject("Only the supervisor can change registered details");
    }
    // On duty is marked by the supervisor, not at the gate. (A guard's own gate entries leave it unchanged.)
    if (op.table === "attendance" && !isMgmt) {
      const sameTime = (x: unknown, y: unknown) => (x == null && y == null) || (x != null && y != null && new Date(String(x)).getTime() === new Date(String(y)).getTime());
      const changesTime = "on_duty_at" in op.data && !sameTime(op.data.on_duty_at, old?.on_duty_at ?? null);
      const changesBy = "on_duty_by" in op.data && op.data.on_duty_by != null && op.data.on_duty_by !== (old?.on_duty_by ?? null);
      if (changesTime || changesBy) throw new Reject("Only the supervisor can mark someone on duty");
    }
    // Gate: someone still running (or helping on) a machine cannot be checked out until the run is stopped.
    if (op.table === "attendance" && !admin && old && !old.gate_out && op.data.gate_out) {
      const pid = String(old.person_id);
      const running = await tx.machine_run.findFirst({
        where: { stopped_at: null, OR: [{ operator_id: pid }, { run_helper_run_id_back: { some: { person_id: pid } } }] },
        select: { id: true },
      });
      if (running) throw new Reject("Still running a machine. Stop the run before checking out.");
    }

    // Starting a machine: the operator themselves, on a machine the supervisor has ticked for them.
    // (Every operator may run the briquette machine and both chippers.)
    if (op.table === "machine_run" && !old && !isMgmt) {
      if (!who.roles.includes("Operator")) throw new Reject("Only an operator can start a machine");
      if (op.data.operator_id !== who.id) throw new Reject("A run is started by the operator themselves");
      const machineId = String(op.data.machine_id);
      const m = await tx.machine.findUnique({ where: { id: machineId }, select: { stage: true } });
      if (!m) throw new Reject("Unknown machine");
      const everyOperator = m.stage === "briquette" || m.stage === "chip";
      const ticked = await tx.operator_machine.findUnique({ where: { person_id_machine_id: { person_id: who.id, machine_id: machineId } } });
      if (!everyOperator && !ticked) throw new Reject("You are not allowed to run this machine. Ask the supervisor to tick it for you.");
    }
    // Anyone may report a problem, but only a fitter (or management) may change an existing job.
    if (op.table === "maintenance_job" && old && !isMgmt && !who.roles.includes("Fitter")) {
      throw new Reject("Only a fitter can change a maintenance job");
    }
    if (!isMgmt && op.table === "person" && op.data.checked === true) {
      throw new Reject("Only the supervisor can confirm a new worker");
    }

    // Adding and removing users: Owner and admins only. "Removing" marks the person inactive.
    if (op.table === "person" && old && "active" in op.data && op.data.active !== old.active) {
      if (!isAdmin(who.roles)) throw new Reject("Only the Owner or an admin can add or remove users");
      const targetRoles = (await tx.person_role.findMany({ where: { person_id: String(op.data.id) }, select: { role: true } })).map((r) => r.role);
      if (op.data.active === false) {
        if (targetRoles.includes("Owner")) throw new Reject("The Owner cannot be removed");
        if (op.data.id === who.id) throw new Reject("You cannot remove yourself");
        if (!canManage(who.id, who.roles, String(op.data.id), targetRoles)) throw new Reject("Only the Owner can remove an admin");
      }
    }

    for (const [k, v] of Object.entries(op.data)) {
      if (WHO.has(k) && v != null && v !== who.id && v !== old?.[k]) throw new Reject(`${k} must be you`);
    }

    if (op.table === "person") {
      const name = String(op.data.full_name ?? old?.full_name ?? "").trim();
      const mobile = op.data.mobile as string | null | undefined;
      if (!name) throw new Reject("Name is required");
      if (mobile && !/^\d{10}$/.test(mobile)) throw new Reject("Mobile must be 10 digits");
      const dup = await tx.person.findFirst({
        where: { full_name: { equals: name, mode: "insensitive" }, NOT: { id: String(op.data.id) } },
        select: { id: true },
      });
      if (dup) throw new Reject("A person with this name already exists");
    }

    const values = Object.fromEntries(Object.entries(op.data).map(([k, v]) => [k, toDb(t, k, v)]));
    const saved = old
      ? await d.update({ where, data: values })
      : await d.create({ data: values });
    await tx.audit_log.create({
      data: {
        table_name: op.table,
        record_id: recordId(t, saved ?? values),
        action: old ? "update" : "insert",
        old_values: plain(old),
        new_values: plain(saved),
        by: who.id,
        at: new Date(),
      },
    });
  });
}

function explain(e: unknown, table: string): string {
  if (e instanceof Reject) return e.message;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      if (table === "person") return "This mobile number is already registered";
      if (table === "weigh_ticket") return "This weighbridge serial number is already entered";
      return "Already exists";
    }
    if (e.code === "P2003") return "Refers to a record the server does not have yet";
  }
  console.error(e);
  return "Could not save";
}

function pushHandler(admin: boolean) {
  return async (req: Request, res: Response) => {
    const body = z.object({ ops: z.array(Op).max(500) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Bad request" });
    const who = req.auth!;
    const results: { ok: boolean; error?: string }[] = [];
    // In order, one by one: a later entry may depend on an earlier one.
    for (const op of body.data.ops) {
      try {
        await applyOp(op, who, admin);
        results.push({ ok: true });
      } catch (e) {
        results.push({ ok: false, error: explain(e, op.table) });
      }
    }
    res.json({ results });
  };
}

syncRouter.post("/sync/push", pushHandler(false));
/** Corrections and Setup lists from the laptop. Every change is kept in audit_log. */
syncRouter.post("/admin/push", requireRole("Owner", "Manager"), pushHandler(true));
