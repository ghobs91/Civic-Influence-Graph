/**
 * P2P CLI entry point (T065).
 * Commands: export, follow, seed, serve, status.
 */

import { parseArgs } from 'node:util';
import pg from 'pg';
import { initFeeds, getFeeds, getFeedInfos, closeFeeds } from './feeds.js';
import { exportEntities } from './export/entity-exporter.js';
import { exportRelationships } from './export/relationship-exporter.js';
import { createChangelogWriter } from './export/changelog.js';
import { exportSnapshot } from './export/snapshot.js';
import { createDiscovery } from './sync/discovery.js';
import { startAdminServer } from './admin-server.js';

const COMMANDS = ['export', 'follow', 'seed', 'serve', 'status'] as const;
type Command = (typeof COMMANDS)[number];

function getPool(): pg.Pool {
  return new pg.Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'cig',
    user: process.env.POSTGRES_USER || 'cig',
    password: process.env.POSTGRES_PASSWORD,
  });
}

function usage(): never {
  console.error('Usage: cig-p2p <command>');
  console.error('');
  console.error('Commands:');
  console.error('  export   Export data from PostgreSQL to P2P feeds');
  console.error('  follow   Follow a remote feed by public key');
  console.error('  seed     Start seeding local feeds to the network');
  console.error('  serve    Start P2P node with admin HTTP API');
  console.error('  status   Show status of local feeds');
  process.exit(1);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'data-dir': { type: 'string', default: process.env.CIG_DATA_DIR || './data/corestore' },
      'key': { type: 'string' },
      'data-sources': { type: 'string', default: 'fec' },
      'election-cycles': { type: 'string', default: '2024,2026' },
    },
  });

  const command = positionals[0] as Command;
  if (!command || !COMMANDS.includes(command)) {
    usage();
  }

  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'data-dir': { type: 'string', default: process.env.CIG_DATA_DIR || './data/corestore' },
      'key': { type: 'string' },
      'data-sources': { type: 'string', default: 'fec' },
      'election-cycles': { type: 'string', default: '2024,2026' },
    },
  });

  const dataDir = parsed.values['data-dir'] as string;

  switch (command) {
    case 'export':
      await runExport(dataDir, parsed.values);
      break;
    case 'follow':
      await runFollow(dataDir, parsed.values);
      break;
    case 'seed':
      await runSeed(dataDir);
      break;
    case 'serve':
      await startAdminServer(dataDir);
      break;
    case 'status':
      await runStatus(dataDir);
      break;
  }
}

async function runExport(
  dataDir: string,
  values: Record<string, string | boolean | undefined>,
): Promise<void> {
  const pool = getPool();
  try {
    const feeds = await initFeeds(dataDir);
    console.log('Exporting entities...');
    const entityStats = await exportEntities(pool, feeds.entities, (count) => {
      process.stdout.write(`\r  Entities: ${count}`);
    });
    console.log(`\n  Entities exported: ${entityStats.entitiesExported}`);
    console.log(`  Index entries: ${entityStats.indexEntriesWritten}`);

    console.log('Exporting relationships...');
    const relStats = await exportRelationships(pool, feeds.relationships, (stats) => {
      process.stdout.write(
        `\r  D:${stats.donations} L:${stats.lobbying} V:${stats.votes} A:${stats.affiliations}`,
      );
    });
    console.log(`\n  Total relationships: ${relStats.totalExported}`);

    console.log('Exporting snapshot...');
    const dataSources = ((values['data-sources'] as string) || 'fec').split(',');
    const electionCycles = ((values['election-cycles'] as string) || '2024,2026').split(',');
    const snapStats = await exportSnapshot(pool, feeds.snapshots, {
      dataSources,
      electionCycles,
      prevSnapshotSeq: 0,
      currentSeq: feeds.changelog.length,
    });
    console.log(`  Snapshot: ${snapStats.totalRecords} records`);

    console.log('Export complete.');
  } finally {
    await closeFeeds();
    await pool.end();
  }
}

async function runFollow(
  dataDir: string,
  values: Record<string, string | boolean | undefined>,
): Promise<void> {
  const key = values['key'] as string | undefined;
  if (!key) {
    console.error('Error: --key is required for follow command');
    process.exit(1);
  }

  console.log(`Following remote feed: ${key}`);

  const feeds = await initFeeds(dataDir);
  const discovery = createDiscovery(feeds);
  await discovery.start();

  console.log('Listening for peers... (Ctrl+C to stop)');

  // Keep running until interrupted
  process.on('SIGINT', async () => {
    console.log('\nStopping...');
    await discovery.stop();
    await closeFeeds();
    process.exit(0);
  });
}

async function runSeed(dataDir: string): Promise<void> {
  const feeds = await initFeeds(dataDir);
  const discovery = createDiscovery(feeds);
  await discovery.start();

  console.log('Seeding feeds to the network... (Ctrl+C to stop)');
  const infos = await getFeedInfos();
  for (const info of infos) {
    console.log(`  ${info.name}: ${info.publicKey.slice(0, 16)}... (${info.length} entries)`);
  }

  process.on('SIGINT', async () => {
    console.log('\nStopping...');
    await discovery.stop();
    await closeFeeds();
    process.exit(0);
  });
}

async function runStatus(dataDir: string): Promise<void> {
  try {
    const feeds = await initFeeds(dataDir);
    const infos = await getFeedInfos();

    console.log('Feed Status:');
    console.log('---');
    for (const info of infos) {
      console.log(`  ${info.name}:`);
      console.log(`    Public key: ${info.publicKey.slice(0, 16)}...`);
      console.log(`    Length:     ${info.length}`);
      console.log(`    Writable:   ${info.writable}`);
    }
  } finally {
    await closeFeeds();
  }
}

// Run if executed directly
const isDirectRun = process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
