// Cross-platform test runner (Windows cmd doesn't expand "**" globs).
// Finds every *.test.ts under tests/unit and runs them with Node's built-in test runner.
// Node 22.18+ runs TypeScript natively; older Node (20.x) uses the tsx loader instead.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const [major, minor] = process.versions.node.split(".").map(Number);
const nativeTs = major > 22 || (major === 22 && minor >= 18);

const loaderArgs = [];
if (!nativeTs) {
  try {
    createRequire(import.meta.url).resolve("tsx");
  } catch {
    console.error(`Node ${process.versions.node} needs the "tsx" package to run TypeScript tests. Run: npm install`);
    process.exit(1);
  }
  loaderArgs.push("--import", "tsx");
}

function findTests(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findTests(path);
    return name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = findTests(join("tests", "unit")).sort();
if (files.length === 0) {
  console.error("No test files found in tests/unit");
  process.exit(1);
}
const result = spawnSync(process.execPath, [...loaderArgs, "--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
