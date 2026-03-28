import { describe, it, expect } from 'vitest';
import { exportCsv, exportJson, buildExportMeta, type ExportMetadata } from '../lib/export.js';
import type { TableRow, PaginationMeta } from '../lib/api-client.js';

const sampleRows: TableRow[] = [
  {
    source_id: 'p1',
    source_name: 'Alice',
    source_type: 'Person',
    target_id: 'c1',
    target_name: 'PAC-Z',
    target_type: 'Committee',
    edge_type: 'DONATED_TO',
    amount: 2500,
    date: '2025-03-15',
    filing_id: 'FEC-99',
  },
  {
    source_id: 'o1',
    source_name: 'Smith, Corp',
    source_type: 'Organization',
    target_id: 'c2',
    target_name: 'PAC-B',
    target_type: 'Committee',
    edge_type: 'LOBBIED_FOR',
    amount: null,
    date: null,
    filing_id: null,
  },
];

const meta: ExportMetadata = {
  export_date: '2025-06-01T12:00:00Z',
  data_snapshot: '2025-05-31T00:00:00Z',
  filters: { start_date: '2025-01-01', min_amount: 1000 },
  total_records: 2,
};

describe('exportCsv', () => {
  it('produces CSV with metadata header and data rows', () => {
    const csv = exportCsv(sampleRows, meta);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('# Export Date: 2025-06-01T12:00:00Z');
    expect(lines[1]).toContain('Data Snapshot: 2025-05-31');
    expect(lines[2]).toContain('Total Records: 2');
    expect(lines[3]).toContain('Filters:');

    // Header row after blank line
    expect(lines[5]).toBe('Source ID,Source Name,Source Type,Target ID,Target Name,Target Type,Edge Type,Amount,Date,Filing ID');

    // First data row
    expect(lines[6]).toBe('p1,Alice,Person,c1,PAC-Z,Committee,DONATED_TO,2500,2025-03-15,FEC-99');
  });

  it('escapes fields with commas', () => {
    const csv = exportCsv(sampleRows, meta);
    expect(csv).toContain('"Smith, Corp"');
  });

  it('handles null values as empty strings', () => {
    const csv = exportCsv(sampleRows, meta);
    const lines = csv.split('\n');
    // Second data row has null amount, date, filing_id
    expect(lines[7]).toMatch(/,,,$/);
  });
});

describe('exportJson', () => {
  it('produces valid JSON with metadata and data', () => {
    const json = exportJson(sampleRows, meta);
    const parsed = JSON.parse(json);

    expect(parsed.metadata.export_date).toBe('2025-06-01T12:00:00Z');
    expect(parsed.metadata.total_records).toBe(2);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0].source_name).toBe('Alice');
  });
});

describe('buildExportMeta', () => {
  it('constructs metadata from API response', () => {
    const apiMeta: PaginationMeta = {
      request_id: 'req-1',
      timestamp: '2025-06-01T00:00:00Z',
      data_snapshot: '2025-05-31T00:00:00Z',
      total_count: 42,
      page: 1,
      page_size: 50,
    };

    const result = buildExportMeta(apiMeta, { start_date: '2025-01-01' });

    expect(result.data_snapshot).toBe('2025-05-31T00:00:00Z');
    expect(result.total_records).toBe(42);
    expect(result.filters.start_date).toBe('2025-01-01');
    expect(result.export_date).toBeDefined();
  });
});
