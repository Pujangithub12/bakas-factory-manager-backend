// The roles, and who may give, take away or manage them.
//
//   Owner       super admin. There is one; the role cannot be given or taken away from the app.
//   Manager     admin. Only the Owner can make someone a Manager.
//   Supervisor  runs the shift. Made by the Owner or a Manager.
//   Operator, Driver, Security, Fitter, Store, Weighbridge  work roles; the Owner, a Manager or a Supervisor can give them.
//
// A person can hold several roles. Nobody is deleted: "removing" a user marks them inactive.

export const ROLES = ["Owner", "Manager", "Supervisor", "Operator", "Driver", "Security", "Fitter", "Store", "Weighbridge"] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as readonly string[]).includes(r);

/** Owner 3, Manager 2, Supervisor 1, anyone else 0. */
export const rank = (roles: string[]) => (roles.includes("Owner") ? 3 : roles.includes("Manager") ? 2 : roles.includes("Supervisor") ? 1 : 0);

export const isAdmin = (roles: string[]) => rank(roles) >= 2;

/** Why this person may not give or take away this role, or null if they may. */
export function roleChangeError(actorRoles: string[], role: string): string | null {
  if (!isRole(role)) return `Unknown role "${role}"`;
  if (role === "Owner") return "The Owner role cannot be given or taken away";
  if (role === "Manager" && rank(actorRoles) < 3) return "Only the Owner can give or remove admin access";
  if (role === "Supervisor" && rank(actorRoles) < 2) return "Only the Owner or an admin can make someone a supervisor";
  return null;
}

/** May the actor manage (set the PIN of, remove) this person? Only someone who outranks them, or the Owner, or themselves. */
export function canManage(actorId: string, actorRoles: string[], targetId: string, targetRoles: string[]): boolean {
  if (actorId === targetId) return true;
  const a = rank(actorRoles);
  return a === 3 || a > rank(targetRoles);
}
