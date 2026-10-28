// Keyset pagination cursor for the public API: newest first, by (created_at, id).
// The cursor is opaque to callers but strictly validated here, because its parts end up in a
// database filter: anything that isn't exactly an ISO timestamp + uuid is rejected.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(cursor)) return null;
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const [createdAt, id, ...rest] = raw.split("|");
  if (rest.length || !createdAt || !id || !ISO.test(createdAt) || !UUID.test(id) || Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}
