'use client';

import { useState, useRef } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';
import { parseCustomerCsv, IMPORT_CSV_COLUMNS, ParsedImportRow, CsvParseResult } from '../../../src/lib/customers/csv-parse';

interface ImportRowOutcome {
  rowNumber: number;
  email: string;
  outcome: 'CREATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'ALREADY_EXISTS';
  message: string;
}

interface ImportCustomersResult {
  created: number;
  skipped: number;
  errors: number;
  rows: ImportRowOutcome[];
}

const OUTCOME_COLOR: Record<ImportRowOutcome['outcome'], string> = {
  CREATED: 'var(--forest-bright)',
  ALREADY_EXISTS: 'var(--ink-soft)',
  INVALID_INPUT: 'var(--clay)',
  FORBIDDEN: 'var(--clay)',
};

function downloadTemplate() {
  const header = IMPORT_CSV_COLUMNS.join(',');
  const example = 'Chihap Grilled Fish Bar,owner@chihap.example.com,,chihap.example.com,+2348012345678,1985-03-05,Restaurant,Imported from old CRM';
  const csv = `${header}\n${example}\n`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'customer-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportPage() {
  const { session } = useAuth();
  const isAdmin = session?.role === 'ADMIN';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportCustomersResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function handleFile(file: File) {
    setReadError(null);
    setImportResult(null);
    setImportError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const result = parseCustomerCsv(text);
      setParseResult(result);
    };
    reader.onerror = () => setReadError('Could not read that file');
    reader.readAsText(file);
  }

  async function handleConfirm() {
    if (!session || !parseResult || parseResult.rows.length === 0) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await authFetch<ImportCustomersResult>(session.token, '/api/admin/customers/import', {
        method: 'POST',
        body: JSON.stringify({ rows: parseResult.rows }),
      });
      setImportResult(result);
      setParseResult(null);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setParseResult(null);
    setFileName(null);
    setReadError(null);
    setImportResult(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (!isAdmin) {
    return (
      <p style={{ color: 'var(--ink-soft)' }}>
        Customer import is only available to admins managing their own assigned customers.
      </p>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Import customers</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, maxWidth: 640, fontSize: '0.9em' }}>
        Bulk-create customers from a CSV file — a row is parsed and shown below for review before
        anything is created. Every imported customer is automatically assigned to you, exactly like
        one you create manually. A row whose email already exists is skipped, not overwritten.
      </p>

      <div className="card" style={{ marginTop: '1.5em', maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: '0.8em', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={downloadTemplate}>
            Download template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {fileName && (
            <button type="button" className="btn" onClick={reset}>
              Clear
            </button>
          )}
        </div>

        {readError && <p className="error-text">{readError}</p>}

        {parseResult && parseResult.parseErrors.length > 0 && (
          <div style={{ marginTop: '1em' }}>
            <p className="error-text" style={{ marginBottom: '0.3em' }}>
              {parseResult.parseErrors.length} row{parseResult.parseErrors.length === 1 ? '' : 's'} could not be parsed:
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: '0.85em', color: 'var(--ink-soft)' }}>
              {parseResult.parseErrors.slice(0, 10).map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          </div>
        )}

        {parseResult && parseResult.rows.length > 0 && (
          <div style={{ marginTop: '1em' }}>
            <p style={{ fontSize: '0.9em', fontWeight: 600 }}>
              {parseResult.rows.length} row{parseResult.rows.length === 1 ? '' : 's'} ready to import
            </p>
            <div className="table-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Domain</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.rows.map((r: ParsedImportRow) => (
                    <tr key={r.rowNumber}>
                      <td className="mono">{r.rowNumber}</td>
                      <td>{r.name}</td>
                      <td>{r.email}</td>
                      <td className="mono">{r.domainName}</td>
                      <td style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>{r.notes ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importError && <p className="error-text">{importError}</p>}

            <button
              type="button"
              className="btn btn-primary"
              disabled={importing}
              onClick={handleConfirm}
              style={{ marginTop: '1em' }}
            >
              {importing ? 'Importing…' : `Confirm import (${parseResult.rows.length} row${parseResult.rows.length === 1 ? '' : 's'})`}
            </button>
          </div>
        )}
      </div>

      {importResult && (
        <div className="card" style={{ marginTop: '1.5em', maxWidth: 720 }}>
          <p style={{ fontWeight: 600, marginTop: 0 }}>
            {importResult.created} created · {importResult.skipped} skipped (already exists) · {importResult.errors} failed
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Email</th>
                  <th>Outcome</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {importResult.rows.map((r) => (
                  <tr key={r.rowNumber}>
                    <td className="mono">{r.rowNumber}</td>
                    <td>{r.email}</td>
                    <td>
                      <span className="status-dot" style={{ background: OUTCOME_COLOR[r.outcome] }} />
                      {r.outcome}
                    </td>
                    <td style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
