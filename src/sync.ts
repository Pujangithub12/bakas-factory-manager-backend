import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Prisma } from "./generated/prisma/client";
import { prisma } from "./prisma";
import { requireAuth, requireRole, MANAGEMENT } from "./auth";
import { canManage, isAdmin, roleChangeError } from "./roles";
import meta from "./meta.json";

type TableMeta = { phase: number; pk: string[]; cols: Record<string, { type: string; opt: boolean; fk?: string }> };
const TABLES = meta as unknown as Record<string, TableMeta>;
/** Own keys only: a name such as "constructor" must not find anything on Object.prototype. */
const own = <T>(o: Record<string, T>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);

// ---------------------------------------------------------------- pull ----

// Lists every phone needs. Small, so they are sent whole each time.
const REFERENCE = [
  "person_role", "operator_machine", "shift", "machine", "stop_reason", "log_field",
  "material", "supplier", "buyer", "yard", "opening_stock",
  "vehicle", "driver_vehicle", "pm_task", "phone_screen",
] as const;

const PR_OPEN = ["Requested", "Approved", "Ordered"];
/** Settings only the Owner may read or change. */
const OWNER_SETTINGS = ["diesel_rate"];

export const syncRouter = Router();
syncRouter.use(requireAuth);

syncRouter.get("/sync/pull", async (req, res) => {
  // Management reads the whole year on the dashboards. Everyone else's screens need a few days, so a phone cannot ask for more.
  const mgmt = req.auth!.roles.some((r) => MANAGEMENT.includes(r));
  const days = Math.min(Math.max(Number(req.query.days) || 3, 1), mgmt ? 400 : 31);
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
    vehicle_session: { OR: [{ started_at: { gte: since } }, open("stopped_at")] },
    diesel_fill: { at: { gte: since } },
    hour_meter_reading: { at: { gte: since } },
    pm_done: { done_at: { gte: since } },
    // Tools still out stay on the list however old they are.
    store_movement: { OR: [{ at: { gte: since } }, { due_back: { not: null }, returned_at: null }] },
    visitor: { OR: [{ time_in: { gte: since } }, open("time_out")] },
    purchase_request: { OR: [{ requested_at: { gte: since } }, { status: { in: PR_OPEN } }] },
    purchase_request_line: { pr_id_rel: { OR: [{ requested_at: { gte: since } }, { status: { in: PR_OPEN } }] } },
  };
  // Rupee columns are for the Owner only. A Manager enters bills and payments, so sees his own of the last 7 days.
  const owner = req.auth!.roles.includes("Owner");
  const manager = req.auth!.roles.includes("Manager");
  const me = req.auth!.id;
  const week = new Date(Date.now() - 7 * 86_400_000);
  const inWindow = { OR: [{ first_at: { gte: since } }, open("second_at")] };
  Object.assign(windowed, {
    power_reading: { at: { gte: since } },
    lab_test: { ticket_id_rel: inWindow },
  });
  const moneyReads = () => {
    const read = (t: string, args: object = {}) => db[t].findMany(args).then((r) => (data[t] = r));
    const out: Promise<unknown>[] = [];
    if (owner) {
      for (const t of ["raw_price", "sale_price", "product_vat", "daily_wage", "nea_tariff"]) out.push(read(t));
      out.push(read("sales_bill", { where: { ticket_id_rel: inWindow } }), read("payment", { where: { at: { gte: since } } }));
    } else if (manager) {
      // The Manager sees which trucks have a bill, but a rate or an amount only on his own entries of the last 7 days.
      const mine = { entered_by: me, entered_at: { gte: week } };
      out.push(
        db.sales_bill.findMany({ where: { ticket_id_rel: inWindow } }).then((rows) => {
          data.sales_bill = (rows as Record<string, unknown>[]).map((b) =>
            b.entered_by === me && new Date(String(b.entered_at)) >= week ? b : { ...b, rate: null, vat_pct: null, payment_mode: null, po_no: null, note: null });
        }),
        read("payment", { where: mine }),
      );
    }
    return out;
  };

  const data: Record<string, unknown[]> = {};
  const db = prisma as unknown as Record<string, { findMany(a?: object): Promise<unknown[]> }>;
  await Promise.all([
    // pin_hash, email and token_version never leave the server. ID numbers and addresses go only to those who register and confirm workers.
    prisma.person.findMany({ omit: { pin_hash: true, email: true, token_version: true, ...(mgmt || req.auth!.roles.includes("Security") ? {} : { id_no: true, address: true }) } }).then((r) => (data.person = r)),
    ...REFERENCE.map((t) => db[t].findMany().then((r) => (data[t] = r))),
    ...Object.entries(windowed).map(([t, where]) => db[t].findMany({ where }).then((r) => (data[t] = r))),
    prisma.store_item.findMany({ omit: owner ? {} : { rate: true } }).then((r) => (data.store_item = r)),
    prisma.moisture_standard.findMany().then((r) => (data.moisture_standard = r)),
    prisma.setting.findMany({ where: owner ? {} : { key: { notIn: OWNER_SETTINGS } } }).then((r) => (data.setting = r)),
    ...moneyReads(),
  ]);
  // The maintenance plan and the hour meter need the latest entry however long ago it was made.
  const [lastDone, lastMeter] = await Promise.all([
    prisma.pm_done.findMany({ distinct: ["task_id"], orderBy: { done_at: "desc" }, where: { task_id: { not: null } } }),
    prisma.hour_meter_reading.findMany({ distinct: ["machine_id"], orderBy: { at: "desc" } }),
  ]);
  const merge = (table: string, extra: { id: string }[]) => {
    const have = new Set((data[table] as { id: string }[]).map((r) => r.id));
    data[table].push(...extra.filter((r) => !have.has(r.id)));
  };
  merge("pm_done", lastDone);
  merge("hour_meter_reading", lastMeter);
  if (!owner) for (const r of data.purchase_request as Record<string, unknown>[]) delete r.amount;

  // Challan numbers restart each fiscal year (1 Shrawan, about 17 July). A phone only holds a few
  // days of tickets, so the server says where the numbering has reached.
  const now = new Date();
  let fyStart = new Date(Date.UTC(now.getUTCFullYear(), 6, 17));
  if (now < fyStart) fyStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 6, 17));
  // The highest challan number of the year, found by the database (POSIX classes: backslashes do not survive a tagged template).
  const [top] = await prisma.$queryRaw<{ challan_no: string }[]>`
    SELECT challan_no FROM weigh_ticket
    WHERE direction = 'out' AND first_at >= ${fyStart} AND challan_no ~ '[[:digit:]][[:space:]]*$'
    ORDER BY length(ltrim(substring(challan_no from '([[:digit:]]+)[[:space:]]*$'), '0')) DESC,
             ltrim(substring(challan_no from '([[:digit:]]+)[[:space:]]*$'), '0') DESC
    LIMIT 1`;
  let last: number | null = null;
  let prefix: string | null = null;
  const m = top ? /^(.*?)(\d+)\s*$/.exec(top.challan_no) : null;
  if (m) {
    last = Number(m[2]);
    prefix = m[1];
  }

  const { tv: _tv, ...caller } = req.auth!;
  res.json({ server_time: now.toISOString(), me: caller, challan: { last, prefix, fy_start: fyStart.toISOString() }, tables: data });
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
  driver_vehicle: { roles: [], del: true }, // a supervisor ticks which vehicles a driver may drive
  attendance: { roles: [...GATE] },
  shift_in_charge: { roles: [] },
  machine_run: { roles: [...FIELD_STAFF] },
  run_helper: { roles: [...FIELD_STAFF] },
  prestart_answer: { roles: [...FIELD_STAFF] },
  run_bypass: { roles: [...FIELD_STAFF] },
  downtime: { roles: [...FIELD_STAFF] },
  log_reading: { roles: [...FIELD_STAFF], del: true }, // an operator corrects or deletes his own reading
  greasing_check: { roles: [...FIELD_STAFF] },
  bag_count: { roles: [...FIELD_STAFF, ...STORE, ...WEIGH] },
  yard_batch: { roles: [...FIELD_STAFF, ...WEIGH] },
  maintenance_job: { roles: [...FIELD_STAFF, ...GATE, ...WEIGH, ...STORE, "Driver"] }, // anyone can report a problem
  weigh_ticket: { roles: [...WEIGH] },
  supplier: { roles: [...WEIGH] },
  buyer: { roles: [...WEIGH] },
  // Phase 2. Anyone on a phone may ask for something; the other rules are checked in applyOp.
  vehicle_session: { roles: ["Driver"] },
  diesel_fill: { roles: ["Driver"] },
  hour_meter_reading: { roles: [...FIELD_STAFF] },
  pm_done: { roles: [...FIELD_STAFF] },
  visitor: { roles: [...GATE] },
  store_item: { roles: [...STORE, "Fitter"] },
  store_movement: { roles: [...STORE, "Fitter"] },
  purchase_request: { roles: [...FIELD_STAFF, ...GATE, ...WEIGH, ...STORE, "Driver"] },
  purchase_request_line: { roles: [...FIELD_STAFF, ...GATE, ...WEIGH, ...STORE, "Driver"] },
  // Phase 3. Money tables are limited to the Owner and a Manager in applyOp.
  power_reading: { roles: [...FIELD_STAFF] },
  lab_test: { roles: [...WEIGH] },
  sales_bill: { roles: [] },
  payment: { roles: [] },
};
/** Bills and payments: the Owner changes any; a Manager enters them and changes his own for 7 days. */
const MONEY_ENTRY = new Set(["sales_bill", "payment"]);
/** Prices and rates: the Owner only. They are set on the laptop (admin route). */
const OWNER_ONLY = new Set(["raw_price", "sale_price", "product_vat", "daily_wage", "nea_tariff"]);

/** A column that records who did it. It must be the signed-in person, or unchanged. */
const WHO = new Set([
  "entered_by", "by", "gate_by", "on_duty_by", "registered_by", "checked_by", "set_by",
  "out_by", "started_by", "finished_by", "reported_by", "returned_by", "changed_by",
  "pass_by", "requested_by", "approved_by", "ordered_by", "received_by",
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 20_000;

/** Checks a value against its column (so a bad entry gets a plain reason, not "Could not save") and converts it. */
function toDb(t: TableMeta, col: string, v: unknown) {
  const c = t.cols[col];
  if (v == null) {
    if (!c.opt && !t.pk.includes(col)) throw new Reject(`${col} is required`);
    return null;
  }
  const type = c.type;
  if (type === "ts" || type === "date" || type === "time") {
    if (typeof v !== "string" && typeof v !== "number") throw new Reject(`Bad date in ${col}`);
    const d = new Date(v);
    if (isNaN(d.getTime())) throw new Reject(`Bad date in ${col}`);
    return d;
  }
  if (type === "uuid") {
    if (typeof v !== "string" || !UUID.test(v)) throw new Reject(`Bad id in ${col}`);
    return v;
  }
  if (type === "text") {
    if (typeof v !== "string" || v.length > MAX_TEXT) throw new Reject(`Bad text in ${col}`);
    return v;
  }
  if (type === "bool") {
    if (typeof v !== "boolean") throw new Reject(`${col} must be true or false`);
    return v;
  }
  if (type === "int") {
    if (typeof v !== "number" || !Number.isInteger(v) || Math.abs(v) > 2_147_483_647) throw new Reject(`${col} must be a whole number`);
    return v;
  }
  const num = /^num(\d+)\.(\d+)$/.exec(type);
  if (num) {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n) || Math.abs(n) >= 10 ** (Number(num[1]) - Number(num[2]))) throw new Reject(`${col} is not a valid number`);
    return v;
  }
  return v; // json
}

function recordId(t: TableMeta, row: Record<string, unknown>): string {
  const isUuid = (c: string) => t.cols[c]?.type === "uuid" && typeof row[c] === "string";
  const col = ["id", ...t.pk.filter(isUuid), ...Object.keys(t.cols).filter(isUuid)].find((c) => isUuid(c));
  if (!col) throw new Reject("No id to log");
  return row[col] as string;
}

const plain = (o: unknown) => (o == null ? undefined : (JSON.parse(JSON.stringify(o)) as Prisma.InputJsonValue));
/** Columns that must never be copied into the audit log. */
const NOT_LOGGED: Record<string, string[]> = { person: ["pin_hash", "email", "token_version"] };
const logged = (table: string, row: Record<string, unknown> | null | undefined) => {
  const drop = own(NOT_LOGGED, table);
  return row && drop ? Object.fromEntries(Object.entries(row).filter(([k]) => !drop.includes(k))) : row;
};

/** Setup lists: only management edits these, from the laptop. */
const SETUP = new Set(["shift", "machine", "stop_reason", "log_field", "material", "yard", "opening_stock", "vehicle", "driver_vehicle", "pm_task", "phone_screen", "raw_price", "sale_price", "product_vat", "moisture_standard", "daily_wage", "nea_tariff", "setting"]);
/** The only rows that may be removed: a tick or a role. Everything else is corrected, never deleted. */
const REMOVABLE = new Set(["person_role", "operator_machine", "driver_vehicle"]);

async function applyOp(op: z.infer<typeof Op>, who: { id: string; roles: string[] }, admin = false) {
  const t = own(TABLES, op.table);
  const rule = own(WRITE, op.table);
  if (!t || (!rule && !(admin && SETUP.has(op.table)))) throw new Reject(`${op.table} cannot be changed from here`);
  // The admin route is already limited to Owner and Manager; it may correct any Phase 1 table.
  if (!admin && !who.roles.some((r) => MANAGEMENT.includes(r) || rule!.roles.includes(r))) throw new Reject("Not allowed");
  if (op.op === "delete" && !(rule?.del || (admin && REMOVABLE.has(op.table)))) throw new Reject("Nothing is deleted; correct it instead");
  if (OWNER_ONLY.has(op.table) && !who.roles.includes("Owner")) throw new Reject("Only the Owner sets prices and rates");
  if (op.table === "setting" && OWNER_SETTINGS.includes(String(op.data.key)) && !who.roles.includes("Owner")) throw new Reject("Only the Owner changes this");
  if (MONEY_ENTRY.has(op.table) && !isAdmin(who.roles)) throw new Reject("Only the Owner or a Manager enters bills and payments");
  // Giving or taking away a role: who may do it depends on the role (see roles.ts).
  if (op.table === "person_role") {
    const err = roleChangeError(who.roles, String(op.data.role));
    if (err) throw new Reject(err);
  }

  const unknown = Object.keys(op.data).filter((k) => !Object.hasOwn(t.cols, k));
  if (unknown.length) throw new Reject(`Unknown column ${unknown.join(", ")}`);
  if (op.table === "person" && "pin_hash" in op.data) throw new Reject("PIN is set from the PIN screen");
  if (op.table === "person" && ("email" in op.data || "token_version" in op.data)) throw new Reject("Email is set from the PIN screen");

  const where = whereOf(t, op.data);

  await prisma.$transaction(async (tx) => {
    const d = (tx as unknown as Record<string, Record<string, (a: object) => Promise<Record<string, unknown> | null>>>)[op.table];
    const old = await d.findUnique({ where });

    const isMgmt = who.roles.some((r) => MANAGEMENT.includes(r));
    if (op.op === "delete") {
      if (!old) return;
      if (op.table === "person_role" && !isMgmt) throw new Reject("Only the supervisor can change roles");
      if (op.table === "log_reading" && !isMgmt && old.by !== who.id) throw new Reject("You can delete only your own reading");
      await d.delete({ where });
      await tx.audit_log.create({
        data: { table_name: op.table, record_id: recordId(t, old), action: "delete", old_values: plain(logged(op.table, old)), by: who.id, at: new Date() },
      });
      return;
    }

    if (op.table === "log_reading" && old && !isMgmt && old.by !== who.id) throw new Reject("You can change only your own reading");
    // A guard registers a new worker with a role. Giving a role to someone already confirmed (or to the guard themselves) is for the supervisor.
    if (op.table === "person_role" && !old && !isMgmt) {
      const target = await tx.person.findUnique({ where: { id: String(op.data.person_id) }, select: { checked: true } });
      if (!target || target.checked) throw new Reject("Only the supervisor can give a role to someone who is already confirmed");
    }
    // A run is changed by the operator who runs it (or a helper on it), and never moved to another operator or machine.
    if (op.table === "machine_run" && old && !isMgmt) {
      const helper = old.operator_id !== who.id && (await tx.run_helper.findUnique({ where: { run_id_person_id: { run_id: String(old.id), person_id: who.id } } }));
      if (old.operator_id !== who.id && !helper) throw new Reject("You can change only a run you are on");
      for (const k of ["operator_id", "machine_id", "entered_by"]) {
        if (k in op.data && op.data[k] !== old[k]) throw new Reject("Who runs a run, and on which machine, cannot be changed");
      }
      if ("started_at" in op.data && new Date(String(op.data.started_at)).getTime() !== new Date(String(old.started_at)).getTime()) throw new Reject("The start time of a run cannot be changed");
    }
    // A driver's own sessions and fills, on vehicles the supervisor has ticked for them.
    if (!isMgmt && (op.table === "vehicle_session" || op.table === "diesel_fill")) {
      const ownerCol = op.table === "vehicle_session" ? "driver_id" : "by";
      if (old ? old[ownerCol] !== who.id : op.data[ownerCol] !== who.id) throw new Reject("This belongs to the driver themselves");
      if (old && ownerCol in op.data && op.data[ownerCol] !== old[ownerCol]) throw new Reject("This belongs to the driver themselves");
      if (!old) {
        const vehicleId = String(op.data.vehicle_id);
        const ticked = await tx.driver_vehicle.findUnique({ where: { person_id_vehicle_id: { person_id: who.id, vehicle_id: vehicleId } } });
        if (!ticked) throw new Reject("You are not allowed to drive this vehicle. Ask the supervisor to tick it for you.");
      }
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

    // Bills and payments: a Manager changes only his own entry, within 7 days. Who changed it, and when, is kept.
    if (MONEY_ENTRY.has(op.table)) {
      const owner = who.roles.includes("Owner");
      if (old && !owner && (old.entered_by !== who.id || Date.now() - new Date(String(old.entered_at)).getTime() > 7 * 86_400_000)) {
        throw new Reject("This entry is locked. Ask the Owner to change it");
      }
      if (old) { op.data.changed_by = who.id; op.data.changed_at = new Date().toISOString(); }
      if (op.table === "sales_bill") {
        const dup = await tx.sales_bill.findFirst({
          where: { bill_no: String(op.data.bill_no ?? old?.bill_no), NOT: { id: String(op.data.id) }, bill_date: { gte: fiscalStart(new Date(String(op.data.bill_date ?? old?.bill_date))) } },
          select: { id: true },
        });
        if (dup) throw new Reject("This bill no. is already entered this fiscal year");
      }
    }
    // Purchase requests: anyone asks; the Owner or a Manager approves; the store (or management) orders and receives.
    if (op.table === "purchase_request" && "status" in op.data && op.data.status !== old?.status) {
      const s = String(op.data.status);
      if (!old && s !== "Requested") throw new Reject("A request starts as Requested");
      if ((s === "Approved" || s === "Rejected") && !isAdmin(who.roles)) throw new Reject("Only the Owner or a Manager approves a request");
      if ((s === "Ordered" || s === "Received") && !isMgmt && !who.roles.includes("Store")) throw new Reject("Only the store orders and receives");
    }
    // Rupee columns: the Owner only.
    if (!who.roles.includes("Owner")) {
      if (op.table === "store_item" && "rate" in op.data && op.data.rate != null && Number(op.data.rate) !== Number(old?.rate ?? NaN)) throw new Reject("Only the Owner sets rates");
      if (op.table === "purchase_request" && "amount" in op.data && op.data.amount != null) throw new Reject("Only the Owner enters amounts");
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
        old_values: plain(logged(op.table, old)),
        new_values: plain(logged(op.table, saved)),
        by: who.id,
        at: new Date(),
      },
    });
  });
}

/** About 1 Shrawan (17 July): bill numbers restart here. */
function fiscalStart(d: Date) {
  const y = d.getUTCFullYear();
  const start = new Date(Date.UTC(y, 6, 17));
  return d < start ? new Date(Date.UTC(y - 1, 6, 17)) : start;
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
