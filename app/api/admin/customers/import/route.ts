// POST /api/admin/customers/import
// The confirm step of CSV bulk customer import (see
// src/lib/customers/csv-import.ts for the full design — parsing happens
// client-side against the raw file so the admin gets a reviewable
// preview first; this route only ever receives already-parsed rows as
// JSON and creates them). ADMIN-only, deliberately excluding
// SUPER_ADMIN, same as every other new route in this feature set.

import { buildAdminWorkflowDeps } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../src/lib/auth/authorize';
import { importCustomersFromCsv, ParsedImportRow } from '../../../../../src/lib/customers/csv-import';

const MAX_ROWS_PER_IMPORT = 500;

export async function POST(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { rows?: ParsedImportRow[] };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return json(400, { error: 'rows must be a non-empty array (see parseCustomerCsv on the client)' });
  }
  if (body.rows.length > MAX_ROWS_PER_IMPORT) {
    return json(400, { error: `A single import is capped at ${MAX_ROWS_PER_IMPORT} rows — split the file and import in batches` });
  }

  const result = await importCustomersFromCsv(buildAdminWorkflowDeps(), auth.session.sub, body.rows);

  return json(200, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
