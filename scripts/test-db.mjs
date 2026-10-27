// Runs the database security tests against a THROWAWAY Postgres database.
//   TEST_DATABASE_URL=postgres://postgres@localhost:5432/taprate_test node scripts/test-db.mjs
// It installs a small Supabase stand-in, applies the migrations, then runs tests/sql/*.test.sql.
// Never point this at your real Supabase project.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("Set TEST_DATABASE_URL to a throwaway Postgres database.");
  process.exit(1);
}
if (/supabase\.co/i.test(url)) {
  console.error("Refusing to run against a hosted Supabase database.");
  process.exit(1);
}

const psql = (file) =>
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { stdio: "inherit" });

psql("tests/sql/00_supabase_shim.sql");
for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  psql(join("supabase/migrations", f));
}
for (const f of readdirSync("tests/sql").filter((f) => f.endsWith(".test.sql")).sort()) {
  psql(join("tests/sql", f));
}
