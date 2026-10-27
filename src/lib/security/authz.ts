// Who may do what. Checked in every API route BEFORE touching the database;
// the database's Row Level Security enforces the same rules again as a second wall.

export const ROLES = ["owner", "admin", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "survey:read",
  "survey:write",
  "response:read",
  "response:export",
  "stats:read",
  "account:read",
  "account:write",
] as const;
export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  owner: new Set(ACTIONS),
  admin: new Set<Action>(["survey:read", "survey:write", "response:read", "response:export", "stats:read", "account:read"]),
  viewer: new Set<Action>(["survey:read", "response:read", "stats:read", "account:read"]),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function canPerform(role: unknown, action: Action): boolean {
  if (!isRole(role)) return false;
  return MATRIX[role].has(action);
}
