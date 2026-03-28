/**
 * CSV and JSON export utility (T046).
 *
 * Exports filtered table results with metadata header including
 * filter params, export date, and snapshot version.
 */

import type { TableRow, TableParams, PaginationMeta } from './api-client';

export interface ExportMetadata {
  export_date: string;
  data_snapshot: string | null;
  filters: Partial<TableParams>;
  total_records: number;
}

/**
 * Escape a CSV field value.
 */
function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_COLUMNS: Array<{ key: keyof TableRow; header: string }> = [
  { key: 'source_id', header: 'Source ID' },
  { key: 'source_name', header: 'Source Name' },
  { key: 'source_type', header: 'Source Type' },
  { key: 'target_id', header: 'Target ID' },
  { key: 'target_name', header: 'Target Name' },
  { key: 'target_type', header: 'Target Type' },
  { key: 'edge_type', header: 'Edge Type' },
  { key: 'amount', header: 'Amount' },
  { key: 'date', header: 'Date' },
  { key: 'filing_id', header: 'Filing ID' },
];

/**
 * Export rows as CSV string with metadata comment header.
 */
export function exportCsv(rows: TableRow[], meta: ExportMetadata): string {
  const lines: string[] = [];

  // Metadata comment header
  lines.push(`# Export Date: ${meta.export_date}`);
  lines.push(`# Data Snapshot: ${meta.data_snapshot ?? 'N/A'}`);
  lines.push(`# Total Records: ${meta.total_records}`);
  lines.push(`# Filters: ${JSON.stringify(meta.filters)}`);
  lines.push('');

  // Column headers
  lines.push(CSV_COLUMNS.map((c) => c.header).join(','));

  // Data rows
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((c) => escapeCsvField(row[c.key])).join(','));
  }

  return lines.join('\n');
}

/**
 * Export rows as JSON string with metadata.
 */
export function exportJson(rows: TableRow[], meta: ExportMetadata): string {
  return JSON.stringify({ metadata: meta, data: rows }, null, 2);
}

/**
 * Build export metadata from API response meta and filter params.
 */
export function buildExportMeta(
  apiMeta: PaginationMeta,
  filters: Partial<TableParams>,
): ExportMetadata {
  return {
    export_date: new Date().toISOString(),
    data_snapshot: apiMeta.data_snapshot,
    filters,
    total_records: apiMeta.total_count,
  };
}

/**
 * Trigger a browser download of a string as a file.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
