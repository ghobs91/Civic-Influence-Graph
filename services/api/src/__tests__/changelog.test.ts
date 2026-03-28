import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { parseSnapshotFile, diffTable, generateChangelog } from '../services/changelog.js';
import type { SnapshotFile } from '../services/snapshot.js';

function makeGzipJsonl(records: Record<string, unknown>[]): Buffer {
  const jsonl = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  return gzipSync(Buffer.from(jsonl, 'utf-8'));
}

describe('parseSnapshotFile', () => {
  it('parses JSONL.gz into id→hash map', () => {
    const data = makeGzipJsonl([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
    ]);

    const map = parseSnapshotFile(data);
    expect(map.size).toBe(2);
    expect(map.has('a')).toBe(true);
    expect(map.has('b')).toBe(true);
  });

  it('skips records without id', () => {
    const data = makeGzipJsonl([{ name: 'No ID' }, { id: 'x', name: 'Has ID' }]);
    const map = parseSnapshotFile(data);
    expect(map.size).toBe(1);
    expect(map.has('x')).toBe(true);
  });

  it('handles empty data', () => {
    const data = gzipSync(Buffer.from('', 'utf-8'));
    const map = parseSnapshotFile(data);
    expect(map.size).toBe(0);
  });
});

describe('diffTable', () => {
  it('detects added records', () => {
    const curr = makeGzipJsonl([{ id: 'a', name: 'Alice' }]);
    const entries = diffTable(null, curr, 'person', 'person');
    expect(entries).toHaveLength(1);
    expect(entries[0].change_type).toBe('added');
    expect(entries[0].entity_id).toBe('a');
  });

  it('detects removed records', () => {
    const prev = makeGzipJsonl([{ id: 'a', name: 'Alice' }]);
    const curr = makeGzipJsonl([]);
    const entries = diffTable(prev, curr, 'person', 'person');
    expect(entries).toHaveLength(1);
    expect(entries[0].change_type).toBe('removed');
  });

  it('detects updated records', () => {
    const prev = makeGzipJsonl([{ id: 'a', name: 'Alice' }]);
    const curr = makeGzipJsonl([{ id: 'a', name: 'Alice Updated' }]);
    const entries = diffTable(prev, curr, 'person', 'person');
    expect(entries).toHaveLength(1);
    expect(entries[0].change_type).toBe('updated');
  });

  it('detects unchanged records (no entries)', () => {
    const data = makeGzipJsonl([{ id: 'a', name: 'Alice' }]);
    const entries = diffTable(data, data, 'person', 'person');
    expect(entries).toHaveLength(0);
  });
});

describe('generateChangelog', () => {
  it('generates a full changelog summary', () => {
    const prevFiles: SnapshotFile[] = [
      { path: 'p.jsonl.gz', table: 'person', data: makeGzipJsonl([{ id: 'a', name: 'Alice' }]), recordCount: 1, checksum: '' },
    ];
    const currFiles: SnapshotFile[] = [
      { path: 'p.jsonl.gz', table: 'person', data: makeGzipJsonl([{ id: 'a', name: 'Alice Updated' }, { id: 'b', name: 'Bob' }]), recordCount: 2, checksum: '' },
    ];

    const changelog = generateChangelog(prevFiles, currFiles);
    expect(changelog.added).toBe(1);
    expect(changelog.updated).toBe(1);
    expect(changelog.removed).toBe(0);
    expect(changelog.unchanged).toBe(0);
    expect(changelog.entries).toHaveLength(2);
  });

  it('handles first snapshot with no previous', () => {
    const currFiles: SnapshotFile[] = [
      { path: 'p.jsonl.gz', table: 'person', data: makeGzipJsonl([{ id: 'a', name: 'Alice' }]), recordCount: 1, checksum: '' },
    ];

    const changelog = generateChangelog(null, currFiles);
    expect(changelog.added).toBe(1);
    expect(changelog.removed).toBe(0);
    expect(changelog.updated).toBe(0);
  });
});
