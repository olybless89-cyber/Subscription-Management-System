import { AdminWorkflowDeps } from '../db/ports';
import { createCustomer } from './manage';
import { ParsedImportRow } from './csv-parse';

// Re-exported for convenience so callers (server-side code, tests) can
// import the whole CSV-import surface from this one module — the
// 'use client' import page is the only caller that must import
// csv-parse.ts directly instead, to keep createCustomer() (and
// everything it transitively pulls in) out of the client bundle.
export * from './csv-parse';

/**
 * importCustomersFromCsv — the server-side confirm step of CSV bulk
 * customer import (see csv-parse.ts for the client-safe parsing half,
 * kept in its own module specifically so the 'use client' import page
 * can parse a file in the browser without pulling createCustomer — and
 * everything it transitively imports — into the client bundle).
 *
 * Deliberately a THIN wrapper around createCustomer() (one call per
 * row), not a separate creation path: every validation rule, the
 * required notificationEmail/domainName invariants, the
 * auto-assign-imported-customers-to-the-importing-admin behavior (spec
 * requirement — mirrors what already happens when a plain admin creates
 * a customer manually), and the audit-log entry all come from
 * createCustomer() for free, and can never drift out of sync with the
 * single-customer creation flow.
 */

export interface ImportRowOutcome {
  rowNumber: number;
  email: string;
  outcome: 'CREATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'ALREADY_EXISTS';
  message: string;
}

export interface ImportCustomersResult {
  created: number;
  skipped: number;
  errors: number;
  rows: ImportRowOutcome[];
}

/**
 * importCustomersFromCsv — the confirm step, called once the admin has
 * reviewed the parsed preview. Every row goes through createCustomer(),
 * so a duplicate email is skipped exactly the way it already would be
 * for a manually-created customer (ALREADY_EXISTS), not a special case
 * invented for import.
 */
export async function importCustomersFromCsv(
  deps: AdminWorkflowDeps,
  requestingAdminId: string,
  rows: ParsedImportRow[]
): Promise<ImportCustomersResult> {
  const result: ImportCustomersResult = { created: 0, skipped: 0, errors: 0, rows: [] };

  for (const row of rows) {
    const created = await createCustomer(deps, requestingAdminId, {
      name: row.name,
      email: row.email,
      notificationEmail: row.notificationEmail,
      domainName: row.domainName,
      phone: row.phone,
      dateOfBirth: row.dateOfBirth,
      websiteType: row.websiteType,
      notes: row.notes,
    });

    if (created.outcome === 'CREATED') {
      result.created++;
    } else if (created.outcome === 'ALREADY_EXISTS') {
      result.skipped++;
    } else {
      result.errors++;
    }

    result.rows.push({
      rowNumber: row.rowNumber,
      email: row.email,
      outcome: created.outcome,
      message: created.message,
    });
  }

  return result;
}
