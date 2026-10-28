// Makes a full backup of the database with pg_dump (needs PostgreSQL client tools installed).
//   DATABASE_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres" node scripts/backup.mjs
// Get the connection string from Supabase: Project Settings -> Database -> Connection string (session mode).
// The file goes into ./backups (ignored by git). Keep backups somewhere safe and private: they contain
// all customer data. Restore with: pg_restore --clean --no-owner -d "<connection string>" <file>
import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('Set DATABASE_URL to your Supabase connection string, e.g.\n  DATABASE_URL="postgresql://..." node scripts/backup.mjs');
  process.exit(1);
}
mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const file = join("backups", `taprate-${stamp}.dump`);
// Custom format (compressed, restorable table by table). The password is passed via the URL in the
// environment, never printed.
const r = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--schema=public", "--schema=private", "--schema=storage", "--file", file, url], { stdio: ["ignore", "inherit", "inherit"] });
if (r.error) {
  console.error("Couldn't run pg_dump. Install the PostgreSQL client tools (https://www.postgresql.org/download/) and try again.");
  process.exit(1);
}
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Backup saved: ${file} (${Math.round(statSync(file).size / 1024)} KB)`);
