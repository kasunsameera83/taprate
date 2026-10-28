// Turns what people paste or upload into a recipient list, with clear reasons for anything left out.
// Accepts:  a CSV with a header (email, name, agent, ticket — in any order, common spellings),
//           or plain lines: "amaya@gmail.com", "Amaya Perera <amaya@gmail.com>", "amaya@gmail.com, Amaya".
// Pure, unit-tested. The server checks every row again.
import { parseCsv } from "../csvImport.ts";
import { recipientSchema, SEND_MAX_RECIPIENTS, type Recipient } from "../validation/sending.ts";

export type RecipientProblem = { line: number; text: string; message: string };
export type ParsedRecipients = { recipients: Recipient[]; problems: RecipientProblem[]; duplicates: number; tooMany: boolean };

const HEADERS: Record<"email" | "name" | "agent" | "ticket", string[]> = {
  email: ["email", "e-mail", "email address", "customer email", "mail"],
  name: ["name", "first name", "firstname", "customer name", "full name", "contact"],
  agent: ["agent", "agent name", "assignee", "staff", "owner"],
  ticket: ["ticket", "ticket id", "ticket number", "order", "order id", "order number", "reference", "ref"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");

function headerMap(cells: string[]): Partial<Record<keyof typeof HEADERS, number>> | null {
  const map: Partial<Record<keyof typeof HEADERS, number>> = {};
  cells.forEach((c, i) => {
    const n = norm(c);
    for (const [field, names] of Object.entries(HEADERS) as Array<[keyof typeof HEADERS, string[]]>) {
      if (map[field] === undefined && names.includes(n)) map[field] = i;
    }
  });
  return map.email !== undefined ? map : null;
}

const ANGLE = /^\s*"?([^"<>]*)"?\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/;

export function parseRecipientText(input: string, max = SEND_MAX_RECIPIENTS): ParsedRecipients {
  const { rows } = parseCsv(input.slice(0, 2_000_000), max * 2 + 50);
  const problems: RecipientProblem[] = [];
  const seen = new Set<string>();
  const out: Recipient[] = [];
  let duplicates = 0;
  let tooMany = false;
  if (rows.length === 0) return { recipients: [], problems, duplicates, tooMany };

  const map = headerMap(rows[0]!);
  const body = map ? rows.slice(1) : rows;
  const offset = map ? 2 : 1;

  body.forEach((cells, i) => {
    const line = i + offset;
    if (cells.every((c) => !c.trim())) return; // empty row, e.g. ",,," from a spreadsheet
    const raw = cells.join(", ").slice(0, 200);
    let candidate: Record<string, string> = {};
    if (map) {
      for (const [field, idx] of Object.entries(map)) {
        const v = (cells[idx as number] ?? "").trim();
        if (v) candidate[field] = v;
      }
    } else {
      const first = (cells[0] ?? "").trim();
      const m = ANGLE.exec(first);
      if (m) candidate = { email: m[2]!, ...(m[1]!.trim() ? { name: m[1]!.trim() } : {}) };
      else {
        candidate = { email: first };
        const second = (cells[1] ?? "").trim();
        if (second) candidate.name = second;
      }
    }
    if (!candidate.email) {
      problems.push({ line, text: raw, message: "No email address" });
      return;
    }
    const parsed = recipientSchema.safeParse(candidate);
    if (!parsed.success) {
      problems.push({ line, text: raw, message: parsed.error.issues[0]?.message ?? "Not valid" });
      return;
    }
    if (seen.has(parsed.data.email)) {
      duplicates++;
      return;
    }
    if (out.length >= max) {
      tooMany = true;
      return;
    }
    seen.add(parsed.data.email);
    out.push(parsed.data);
  });
  return { recipients: out, problems: problems.slice(0, 200), duplicates, tooMany };
}
