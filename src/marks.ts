// The attendance sheet: who may mark which day. The same limits are shown on the phone and laptop (markBackDays in mobile/src/rules.ts).

export const MARK_STATUSES = ["Present", "Half day", "Absent", "Leave", "Off"];

const NPT_MS = (5 * 60 + 45) * 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** The production day a moment belongs to, as 2026-11-23. It runs 06:00 to 06:00 Nepal time. */
export const productionDay = (at = new Date()) => new Date(at.getTime() + NPT_MS - 6 * HOUR).toISOString().slice(0, 10);

/** When a production day starts and ends. */
export function dayWindow(day: string) {
  const from = new Date(Date.parse(`${day}T06:00:00Z`) - NPT_MS);
  return { from, to: new Date(from.getTime() + DAY) };
}

/** A real calendar date as YYYY-MM-DD, or null. */
export function markDay(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/** Setting key: who may see or mark the sheet, set by the Owner. { person id: "none" | "view" | "edit" }. */
export const ATT_ACCESS_KEY = "attendance_access";
export const ATT_LEVELS = ["none", "view", "edit"] as const;
export type AttAccess = (typeof ATT_LEVELS)[number];

/** The Owner always marks. Anyone else: what the Owner set for them, otherwise Manager and Supervisor mark and the rest have no access. */
export function accessFrom(list: unknown, personId: string, roles: string[]): AttAccess {
  if (roles.includes("Owner")) return "edit";
  const set = list && typeof list === "object" && !Array.isArray(list) ? (list as Record<string, unknown>)[personId] : undefined;
  if ((ATT_LEVELS as readonly unknown[]).includes(set)) return set as AttAccess;
  return roles.includes("Manager") || roles.includes("Supervisor") ? "edit" : "none";
}

/** Checks the access list the Owner saves. Returns why it is refused, or null. */
export function accessListError(v: unknown): string | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "Bad access list";
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > 2000) return "Bad access list";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const [k, x] of entries) if (!uuid.test(k) || !(ATT_LEVELS as readonly unknown[]).includes(x)) return "Bad access list";
  return null;
}

/** How many days back someone who may mark can go: the Owner any day, a Manager 7, anyone else today and yesterday. */
export function markBackDays(roles: string[]) {
  if (roles.includes("Owner")) return Infinity;
  if (roles.includes("Manager")) return 7;
  return 1;
}

/** Why this person may not mark this day, or null when they may. */
export function markWindowError(roles: string[], day: string, now = new Date(), access: AttAccess = "edit"): string | null {
  if (access !== "edit") return "You do not have access to change the attendance sheet. Ask the Owner";
  const back = markBackDays(roles);
  const ago = Math.round((Date.parse(productionDay(now)) - Date.parse(day)) / DAY);
  if (ago < 0) return "Attendance cannot be marked for a future day";
  if (ago > back) return roles.includes("Manager") ? "A Manager can mark only the last 7 days. Ask the Owner" : "You can mark only today and yesterday. Ask a Manager";
  return null;
}
