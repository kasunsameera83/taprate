// CSV import of past ratings: parsing and checking in the browser for an instant preview.
// The server checks every row again with the same schema, and the database checks again after that.
// Pure, unit-tested.
import { importRowSchema, IMPORT_MAX_ROWS } from "./validation/schemas.ts";
import { ICON_SETS, type IconSetId } from "./surveys/iconSets.ts";

export const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const IMPORT_FIELDS = ["date", "rating", "email", "comment", "agent", "ticket"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ImportField, number>>;

/** RFC 4180 CSV (quotes, doubled quotes, newlines inside quotes, CRLF). Comma, semicolon or tab separated. */
export function parseCsv(input: string, maxRows = IMPORT_MAX_ROWS + 1): { rows: string[][]; truncated: boolean } {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<string, number>;
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]!++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const sep = best && best[1] > 0 ? best[0] : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const pushRow = () => {
    row.push(cell);
    cell = "";
    if (!(row.length === 1 && row[0] === "")) rows.push(row); // skip blank lines
    row = [];
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === "") inQuotes = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushRow();
      if (rows.length >= maxRows) return { rows, truncated: i + 1 < text.length };
    } else cell += ch;
    i++;
  }
  if (cell !== "" || row.length > 0) pushRow();
  return { rows, truncated: false };
}

const SYNONYMS: Record<ImportField, string[]> = {
  date: ["date", "created", "created at", "created_at", "timestamp", "submitted", "submitted at", "time", "date time", "datetime"],
  rating: ["rating", "score", "value", "rate", "csat", "nps"],
  email: ["email", "e-mail", "customer email", "respondent", "respondent email", "customer"],
  comment: ["comment", "comments", "feedback", "note", "notes", "message"],
  agent: ["agent", "agent name", "assignee", "staff", "employee", "advisor"],
  ticket: ["ticket", "ticket id", "ticket_id", "ticket number", "ticket ref", "ticket_ref", "reference", "case", "case id"],
};

/** Guesses which column is which from the header row. */
export function detectColumns(header: string[]): ColumnMapping {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const out: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const idx = norm.findIndex((h, i) => !used.has(i) && SYNONYMS[field].includes(h));
    if (idx >= 0) {
      out[field] = idx;
      used.add(idx);
    }
  }
  return out;
}

/**
 * Dates: 2025-03-14, 2025/03/14, 2025-03-14 09:30, 2025-03-14T09:30:00Z, 2025-03-14T09:30:00+05:30.
 * Without a time zone, the time is read in the computer's local time zone. Day/month orders like
 * 03/04/2025 are refused because they're ambiguous.
 */
export function parseDateCell(value: string): string | null {
  const v = value.trim();
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(v);
  if (!m) return null;
  const [y, mo, d, h = "0", mi = "0", s = "0", , tz] = m.slice(1) as Array<string | undefined>;
  const n = [Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s)] as const;
  if (n[1] < 1 || n[1] > 12 || n[2] < 1 || n[2] > 31 || n[3] > 23 || n[4] > 59 || n[5] > 59) return null;
  let date: Date;
  if (tz) {
    const off = tz.toUpperCase() === "Z" ? "Z" : `${tz.slice(0, 3)}:${tz.slice(-2)}`;
    date = new Date(`${y}-${String(n[1]).padStart(2, "0")}-${String(n[2]).padStart(2, "0")}T${String(n[3]).padStart(2, "0")}:${String(n[4]).padStart(2, "0")}:${String(n[5]).padStart(2, "0")}${off}`);
  } else {
    date = new Date(n[0], n[1] - 1, n[2], n[3], n[4], n[5]);
    // Reject impossible days (e.g. 31 February rolls over into March).
    if (date.getFullYear() !== n[0] || date.getMonth() !== n[1] - 1 || date.getDate() !== n[2]) return null;
  }
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export type ImportRowOut = { date: string; rating: number; email?: string; comment?: string; agent?: string; ticket?: string };
export type RowProblem = { line: number; message: string };

/** Checks one data row. `line` is the line number people see in a spreadsheet (header = line 1). */
export function checkRow(cells: string[], mapping: ColumnMapping, iconSet: IconSetId, line: number): { ok: true; row: ImportRowOut } | { ok: false; problem: RowProblem } {
  const cell = (f: ImportField) => (mapping[f] === undefined ? "" : (cells[mapping[f]!] ?? "").trim());
  const date = parseDateCell(cell("date"));
  if (!date) return { ok: false, problem: { line, message: `Date “${cell("date").slice(0, 30)}” isn't a date like 2025-03-14 or 2025-03-14 09:30` } };
  const ratingText = cell("rating");
  if (!/^\d{1,2}$/.test(ratingText)) return { ok: false, problem: { line, message: `Rating “${ratingText.slice(0, 20)}” isn't a whole number` } };
  const rating = Number(ratingText);
  const scale = ICON_SETS[iconSet];
  if (rating < scale.min || rating > scale.max) return { ok: false, problem: { line, message: `Rating ${rating} is outside this survey's scale (${scale.min}–${scale.max})` } };

  const candidate: Record<string, unknown> = { date, rating };
  for (const f of ["email", "comment", "agent", "ticket"] as const) {
    const v = cell(f);
    if (v) candidate[f] = v;
  }
  const parsed = importRowSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? "");
    return { ok: false, problem: { line, message: `${field ? field[0]!.toUpperCase() + field.slice(1) + ": " : ""}${issue?.message ?? "invalid value"}` } };
  }
  return { ok: true, row: parsed.data };
}

export function checkAll(rows: string[][], mapping: ColumnMapping, iconSet: IconSetId): { valid: ImportRowOut[]; problems: RowProblem[] } {
  const valid: ImportRowOut[] = [];
  const problems: RowProblem[] = [];
  rows.forEach((cells, i) => {
    const r = checkRow(cells, mapping, iconSet, i + 2);
    if (r.ok) valid.push(r.row);
    else problems.push(r.problem);
  });
  return { valid, problems };
}

export const SAMPLE_CSV = "date,rating,email,comment,agent,ticket\n2025-03-14 09:30,5,amaya@example.com,Quick and friendly,Nimal,1042\n2025-03-15,2,,Took too long,Kumari,1043\n";
