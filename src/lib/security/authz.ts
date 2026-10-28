// Who may do what. Checked in every API route BEFORE touching the database;
// the database's Row Level Security and team functions enforce the same rules again.

export const ROLES = ["owner", "admin", "viewer", "agent"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "survey:read",
  "survey:write",
  "response:read",
  "response:export",
  "stats:read",
  "account:read",
  "account:write",
  "account:export",
  "account:delete",
  "team:read",
  "team:write",
  "privacy:erase",
  "audit:read",
  "integrations:read",
  "integrations:write",
  "apikeys:manage",
  "responses:import",
  "billing:manage",
  "insights:read",
  "insights:generate",
  "sends:read",
  "sends:write",
] as const;
export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  owner: new Set(ACTIONS),
  admin: new Set<Action>([
    "survey:read",
    "survey:write",
    "response:read",
    "response:export",
    "stats:read",
    "account:read",
    "team:read",
    "team:write",
    "privacy:erase",
    "audit:read",
    "integrations:read",
    "integrations:write",
    "apikeys:manage",
    "responses:import",
    "insights:read",
    "insights:generate",
    "sends:read",
    "sends:write",
  ]),
  viewer: new Set<Action>(["survey:read", "response:read", "stats:read", "account:read", "insights:read", "sends:read"]),
  // Agents see surveys and only the ratings given for them (filtered in the database).
  agent: new Set<Action>(["survey:read", "response:read", "stats:read", "account:read"]),
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function canPerform(role: unknown, action: Action): boolean {
  if (!isRole(role)) return false;
  return MATRIX[role].has(action);
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", admin: "Admin", viewer: "Viewer", agent: "Agent" };

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: "Everything, including billing, team and deleting the account.",
  admin: "Surveys, responses, exports and inviting viewers and agents.",
  viewer: "Can see surveys and all ratings, but not change anything.",
  agent: "Sees only the ratings customers gave for them.",
};
