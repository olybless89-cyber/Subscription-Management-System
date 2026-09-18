/**
 * csv-parse.ts — the client-safe half of CSV customer bulk import (see
 * csv-import.ts for the server-side confirm step). Kept in its own
 * module, with NO imports beyond the standard library, specifically so
 * the 'use client' import page (app/dashboard/import/page.tsx) can
 * parse a file in the browser without pulling any server-only code into
 * the client bundle.
 *
 * parseCustomerCsv() is pure and network-free — it runs on the raw file
 * text to produce a reviewable preview; nothing is created yet. The
 * admin then reviews that preview and, on confirm, the page POSTs the
 * parsed rows (as JSON, not the original CSV) to
 * /api/admin/customers/import, which calls importCustomersFromCsv().
 */

export interface ParsedImportRow {
  /** 1-based row number within the CSV (header excluded), for error
   * reporting — never used as an id. */
  rowNumber: number;
  name: string;
  email: string;
  notificationEmail: string;
  domainName: string;
  phone: string | null;
  dateOfBirth: string | null;
  websiteType: string | null;
  notes: string | null;
}

export interface CsvParseResult {
  rows: ParsedImportRow[];
  /** Rows that couldn't even be parsed into a candidate (missing a
   * required column) — reported separately from per-row creation
   * errors, which only surface once importCustomersFromCsv() actually
   * tries to create them. */
  parseErrors: Array<{ rowNumber: number; message: string }>;
}

/** The column headers the template download uses and parseCustomerCsv()
 * recognizes, case-insensitively, in any order. Only name/email/domainName
 * are required per row — see createCustomer()'s own validation for why
 * domainName in particular can't be optional here. */
export const IMPORT_CSV_COLUMNS = [
  'name',
  'email',
  'notificationEmail',
  'domainName',
  'phone',
  'dateOfBirth',
  'websiteType',
  'notes',
] as const;

/** Splits one CSV line into fields, honoring double-quoted fields that
 * may contain commas or escaped ("") quotes — the minimum needed to
 * safely round-trip a name like `"Acme, Inc."` or a notes field with
 * embedded commas. Not a full RFC 4180 implementation (no embedded
 * newlines inside a quoted field), which is an accepted limitation for
 * an admin-authored spreadsheet export rather than arbitrary CSV input. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/**
 * parseCustomerCsv — pure and synchronous on purpose: it never touches
 * the database, so the browser can call it directly on the raw file
 * text to build the preview table before anything is created.
 */
export function parseCustomerCsv(csvText: string): CsvParseResult {
  const lines = csvText.split(/\r\n|\r|\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) {
    return { rows: [], parseErrors: [{ rowNumber: 0, message: 'The file is empty' }] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const colIndex = (name: string) => header.indexOf(name.toLowerCase());

  const nameIdx = colIndex('name');
  const emailIdx = colIndex('email');
  const domainIdx = colIndex('domainName');
  if (nameIdx === -1 || emailIdx === -1 || domainIdx === -1) {
    return {
      rows: [],
      parseErrors: [
        {
          rowNumber: 0,
          message: 'The file must have name, email, and domainName columns (see the template download)',
        },
      ],
    };
  }

  const notificationEmailIdx = colIndex('notificationEmail');
  const phoneIdx = colIndex('phone');
  const dobIdx = colIndex('dateOfBirth');
  const websiteTypeIdx = colIndex('websiteType');
  const notesIdx = colIndex('notes');

  const rows: ParsedImportRow[] = [];
  const parseErrors: CsvParseResult['parseErrors'] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i; // 1-based, header excluded (line index 1 => row 1)
    const fields = splitCsvLine(lines[i]);

    const name = fields[nameIdx]?.trim() ?? '';
    const email = fields[emailIdx]?.trim().toLowerCase() ?? '';
    const domainName = fields[domainIdx]?.trim().toLowerCase() ?? '';

    if (!name || !email || !domainName) {
      parseErrors.push({
        rowNumber,
        message: `Row ${rowNumber}: name, email, and domainName are all required (got name="${name}", email="${email}", domainName="${domainName}")`,
      });
      continue;
    }

    const notificationEmailRaw = notificationEmailIdx !== -1 ? fields[notificationEmailIdx]?.trim().toLowerCase() : '';

    rows.push({
      rowNumber,
      name,
      email,
      notificationEmail: notificationEmailRaw || email,
      domainName,
      phone: phoneIdx !== -1 ? fields[phoneIdx]?.trim() || null : null,
      dateOfBirth: dobIdx !== -1 ? fields[dobIdx]?.trim() || null : null,
      websiteType: websiteTypeIdx !== -1 ? fields[websiteTypeIdx]?.trim() || null : null,
      notes: notesIdx !== -1 ? fields[notesIdx]?.trim() || null : null,
    });
  }

  return { rows, parseErrors };
}

