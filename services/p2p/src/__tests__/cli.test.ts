import { describe, it, expect, vi } from 'vitest';

vi.mock('corestore', () => ({ default: vi.fn() }));
vi.mock('hyperbee', () => ({ default: vi.fn() }));
vi.mock('hyperdrive', () => ({ default: vi.fn() }));
vi.mock('hyperswarm', () => ({ default: vi.fn() }));
vi.mock('pg', () => ({
  default: { Pool: vi.fn().mockImplementation(() => ({ end: vi.fn() })) },
}));

// Mock all modules used by CLI
vi.mock('../feeds.js', () => ({
  initFeeds: vi.fn().mockResolvedValue({
    store: {},
    entities: { core: { key: Buffer.alloc(32), length: 100 } },
    relationships: { core: { key: Buffer.alloc(32), length: 50 } },
    changelog: { key: Buffer.alloc(32), length: 10 },
    snapshots: { core: { key: Buffer.alloc(32), length: 5 } },
  }),
  getFeeds: vi.fn(),
  getFeedInfos: vi.fn().mockResolvedValue([
    { name: 'cig-entities', publicKey: 'aa'.repeat(32), length: 100, writable: true },
    { name: 'cig-relationships', publicKey: 'bb'.repeat(32), length: 50, writable: true },
    { name: 'cig-changelog', publicKey: 'cc'.repeat(32), length: 10, writable: true },
    { name: 'cig-snapshots', publicKey: 'dd'.repeat(32), length: 5, writable: true },
  ]),
  closeFeeds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../export/entity-exporter.js', () => ({
  exportEntities: vi.fn().mockResolvedValue({ entitiesExported: 100, indexEntriesWritten: 500 }),
}));

vi.mock('../export/relationship-exporter.js', () => ({
  exportRelationships: vi.fn().mockResolvedValue({
    donations: 50, lobbying: 20, votes: 30, affiliations: 10, totalExported: 110,
  }),
}));

vi.mock('../export/changelog.js', () => ({
  createChangelogWriter: vi.fn(),
}));

vi.mock('../export/snapshot.js', () => ({
  exportSnapshot: vi.fn().mockResolvedValue({ recordCounts: {}, totalRecords: 210, manifestPath: '/manifest.json' }),
}));

vi.mock('../sync/discovery.js', () => ({
  createDiscovery: vi.fn().mockReturnValue({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    peerCount: 0,
    isActive: false,
  }),
}));

vi.mock('../admin-server.js', () => ({
  startAdminServer: vi.fn().mockResolvedValue(undefined),
}));

import { main } from '../cli.js';
import { closeFeeds } from '../feeds.js';
import { startAdminServer } from '../admin-server.js';

describe('cli', () => {
  it('status command shows feed info', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await main(['status', '--data-dir', '/tmp/test-store']);

    expect(logSpy).toHaveBeenCalledWith('Feed Status:');
    expect(closeFeeds).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('export command runs full pipeline', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await main(['export', '--data-dir', '/tmp/test-store']);

    expect(logSpy).toHaveBeenCalledWith('Export complete.');
    logSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it('serve command starts admin server', async () => {
    await main(['serve', '--data-dir', '/tmp/test-store']);

    expect(startAdminServer).toHaveBeenCalledWith('/tmp/test-store');
  });

  it('exits with usage for unknown command', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

    await expect(main(['invalid'])).rejects.toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
