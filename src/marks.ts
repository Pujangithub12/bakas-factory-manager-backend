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

/** How many days back this person may mark: the Owner any day, a Manager 7, a Supervisor the previous day. */
export function markBackDays(roles: string[]) {
  if (roles.includes("Owner")) return Infinity;
  if (roles.includes("Manager")) return 7;
  if (roles.includes("Supervisor")) return 1;
  return -1;
}

/** Why this person may not mark this day, or null when they may. */
export function markWindowError(roles: string[], day: string, now = new Date()): string | null {
  const back = markBackDays(roles);
  if (back < 0) return "Only a Supervisor, Manager or the Owner can mark attendance";
  const ago = Math.round((Date.parse(productionDay(now)) - Date.parse(day)) / DAY);
  if (ago < 0) return "Attendance cannot be marked for a future day";
  if (ago > back) return roles.includes("Manager") ? "A Manager can mark only the last 7 days. Ask the Owner" : "A Supervisor can mark only today and yesterday. Ask a Manager";
  return null;
}
