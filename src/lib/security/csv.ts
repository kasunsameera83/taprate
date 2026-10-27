// CSV export with spreadsheet formula-injection protection.
// A customer could type "=HYPERLINK(...)" in a comment; when the business opens the export in
// Excel that would run as a formula. We neutralise any cell that starts with = + - @ tab or CR.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s) || s.startsWith("'")) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: ReadonlyArray<{ key: keyof T; header: string }>,
): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(","));
  // BOM so Excel opens UTF-8 (Sinhala/Tamil comments) correctly.
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}
