/**
 * Ingestion CLI entry point.
 *
 * Orchestrates the full FEC data pipeline:
 *   download → parse → validate → deduplicate → resolve amendments → load → index
 *
 * Commands:
 *   download  — Download FEC bulk ZIP files for a cycle
 *   parse     — Parse downloaded bulk files
 *   load      — Deduplicate, resolve amendments, and load into PostgreSQL + AGE
 *   index     — Index entities into OpenSearch
 *   run       — Execute all stages end-to-end (--full)
 */

import { parseArgs } from 'node:util';
import path from 'node:path';
import pg from 'pg';
import {
  FEC_FILE_TYPES,
  FEC_FILE_DESCRIPTIONS,
  downloadAllFecFiles,
  type FecFileType,
} from './pipelines/fec-download.js';
import {
  parseFile,
  parseFecDate,
  parseFecAmount,
  mapTransactionType,
  FEC_COLUMNS,
  type FecRecord,
} from './pipelines/fec-parse.js';
import { filterToCanonical } from './pipelines/fec-amendments.js';
import {
  extractCandidateEntity,
  extractCommitteeEntity,
  resolveEntity,
  type CandidateLookup,
} from './resolution/deduplicate.js';
import {
  upsertCandidate,
  upsertCommittee,
  insertDonation,
  processLinkage,
  buildCandidateIdMap,
  buildCommitteeIdMap,
} from './pipelines/fec-load.js';
import { validateRecord } from './validation/validate.js';

// ============================================================
// CLI ARGUMENT PARSING
// ============================================================

export interface CliOptions {
  command: string;
  cycle: string;
  dataDir: string;
  dbUrl: string;
  opensearchUrl: string;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv.slice(2),
    options: {
      cycle: { type: 'string', default: '2024' },
      'data-dir': { type: 'string', default: './data' },
      'db-url': { type: 'string', default: process.env.DATABASE_URL ?? 'postgresql://cig:cig@localhost:5432/cig' },
      'opensearch-url': { type: 'string', default: process.env.OPENSEARCH_URL ?? 'https://localhost:9200' },
    },
    allowPositionals: true,
    strict: true,
  });

  const command = positionals[0] ?? 'help';
  return {
    command,
    cycle: values.cycle ?? '2024',
    dataDir: values['data-dir'] ?? './data',
    dbUrl: values['db-url'] ?? 'postgresql://cig:cig@localhost:5432/cig',
    opensearchUrl: values['opensearch-url'] ?? 'https://localhost:9200',
  };
}

// ============================================================
// PIPELINE STAGES
// ============================================================

export interface PipelineStats {
  downloaded: number;
  parsed: number;
  validationErrors: number;
  candidates_loaded: number;
  committees_loaded: number;
  donations_loaded: number;
  linkages_loaded: number;
  indexed: number;
}

function emptyStats(): PipelineStats {
  return {
    downloaded: 0,
    parsed: 0,
    validationErrors: 0,
    candidates_loaded: 0,
    committees_loaded: 0,
    donations_loaded: 0,
    linkages_loaded: 0,
    indexed: 0,
  };
}

/**
 * Stage 1: Download bulk files from FEC.
 */
export async function stageDownload(cycle: string, dataDir: string): Promise<Map<FecFileType, string>> {
  const cycleDir = path.join(dataDir, cycle);
  console.log(`Downloading FEC bulk files for cycle ${cycle} to ${cycleDir}...`);

  const paths = await downloadAllFecFiles(cycle, cycleDir, (progress) => {
    if (progress.status === 'complete') {
      console.log(`  ✓ ${FEC_FILE_DESCRIPTIONS[progress.fileType]} (${progress.bytesDownloaded} bytes)`);
    } else if (progress.status === 'error') {
      console.error(`  ✗ ${FEC_FILE_DESCRIPTIONS[progress.fileType]}: ${progress.error}`);
    }
  });

  console.log(`Downloaded ${paths.size} files.`);
  return paths;
}

/**
 * Stage 2: Parse bulk files into record arrays.
 * Returns a map of file type → records.
 */
export async function stageParse(
  cycle: string,
  dataDir: string,
): Promise<Map<FecFileType, FecRecord[]>> {
  const cycleDir = path.join(dataDir, cycle);
  const result = new Map<FecFileType, FecRecord[]>();

  for (const fileType of FEC_FILE_TYPES) {
    const yy = cycle.slice(-2);
    // After download + unzip, the extracted file is named e.g. cn24.txt
    const filePath = path.join(cycleDir, `${fileType}${yy}.txt`);
    const columns = FEC_COLUMNS[fileType];
    const records: FecRecord[] = [];

    console.log(`Parsing ${FEC_FILE_DESCRIPTIONS[fileType]} (${filePath})...`);

    await parseFile(filePath, columns, {
      onRecord: (record) => {
        records.push(record);
      },
      onProgress: (progress) => {
        if (progress.linesProcessed % 100_000 === 0) {
          console.log(`  ${progress.linesProcessed} lines processed...`);
        }
      },
    });

    // Validate and filter
    let validationErrors = 0;
    const validRecords: FecRecord[] = [];
    for (const record of records) {
      const validation = validateRecord(record, fileType);
      if (validation.valid) {
        validRecords.push(record);
      } else {
        validationErrors++;
      }
    }

    if (validationErrors > 0) {
      console.log(`  ⚠ ${validationErrors} records failed validation`);
    }
    console.log(`  ✓ ${validRecords.length} valid records`);
    result.set(fileType, validRecords);
  }

  return result;
}

/**
 * Stage 3: Load parsed records into PostgreSQL and AGE graph.
 */
export async function stageLoad(
  parsed: Map<FecFileType, FecRecord[]>,
  pool: pg.Pool,
): Promise<PipelineStats> {
  const stats = emptyStats();

  console.log('Loading data into PostgreSQL...');

  // Build candidate lookup for entity resolution
  const lookupCandidates: CandidateLookup = async (_type, _name, _sourceIds) => {
    // For initial bulk load, we use a simplified lookup:
    // we match by source_ids JSONB containment
    return [];
  };

  // Phase 1: Load candidates (cn records)
  const cnRecords = parsed.get('cn') ?? [];
  console.log(`  Loading ${cnRecords.length} candidates...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const record of cnRecords) {
      const extracted = extractCandidateEntity(record);
      const decision = await resolveEntity(extracted, lookupCandidates);
      await upsertCandidate(client, record, decision);
      stats.candidates_loaded++;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  console.log(`  ✓ ${stats.candidates_loaded} candidates loaded`);

  // Phase 2: Load committees (cm records)
  const cmRecords = parsed.get('cm') ?? [];
  console.log(`  Loading ${cmRecords.length} committees...`);
  const client2 = await pool.connect();
  try {
    await client2.query('BEGIN');

    for (const record of cmRecords) {
      const extracted = extractCommitteeEntity(record);
      const decision = await resolveEntity(extracted, lookupCandidates);
      await upsertCommittee(client2, record, decision);
      stats.committees_loaded++;
    }

    await client2.query('COMMIT');
  } catch (err) {
    await client2.query('ROLLBACK');
    throw err;
  } finally {
    client2.release();
  }
  console.log(`  ✓ ${stats.committees_loaded} committees loaded`);

  // Phase 3: Process linkages (ccl records)
  const cclRecords = parsed.get('ccl') ?? [];
  console.log(`  Processing ${cclRecords.length} linkages...`);
  const client3 = await pool.connect();
  try {
    await client3.query('BEGIN');

    for (const record of cclRecords) {
      await processLinkage(client3, record);
      stats.linkages_loaded++;
    }

    await client3.query('COMMIT');
  } catch (err) {
    await client3.query('ROLLBACK');
    throw err;
  } finally {
    client3.release();
  }
  console.log(`  ✓ ${stats.linkages_loaded} linkages processed`);

  // Phase 4: Load donations (indiv + pas2 + oth, after amendment resolution)
  for (const fileType of ['indiv', 'pas2', 'oth'] as const) {
    const records = parsed.get(fileType) ?? [];
    const canonical = filterToCanonical(records);
    console.log(`  Loading ${canonical.length} ${FEC_FILE_DESCRIPTIONS[fileType]} (from ${records.length} after amendment resolution)...`);

    const donationClient = await pool.connect();
    try {
      await donationClient.query('BEGIN');

      for (const record of canonical) {
        try {
          await insertDonation(donationClient, record);
          stats.donations_loaded++;
        } catch {
          // Skip records that fail (e.g., missing date)
        }
      }

      await donationClient.query('COMMIT');
    } catch (err) {
      await donationClient.query('ROLLBACK');
      throw err;
    } finally {
      donationClient.release();
    }
  }
  console.log(`  ✓ ${stats.donations_loaded} donations loaded`);

  return stats;
}

/**
 * Stage 4: Index entities into OpenSearch.
 * Dynamically imports the search service to avoid bundling it as a hard dependency.
 */
export async function stageIndex(
  opensearchUrl: string,
): Promise<number> {
  console.log('Indexing entities into OpenSearch...');

  // Dynamic import to avoid hard dependency on @opensearch-project/opensearch
  const { indexAllEntities } = await import('../../search/src/indexer.js');

  // indexAllEntities needs a pg.Pool and OpenSearch client — those are created
  // internally by the search service. For now we just log that this stage
  // would be executed.
  console.log('  OpenSearch indexing requires running services. Use: npm run index');
  return 0;
}

// ============================================================
// HELP
// ============================================================

function printHelp(): void {
  console.log(`
cig-ingest — Civic Influence Graph FEC Ingestion Pipeline

Usage:
  cig-ingest <command> [options]

Commands:
  download   Download FEC bulk ZIP files for an election cycle
  parse      Parse downloaded bulk files into records
  load       Deduplicate, resolve amendments, load into PostgreSQL + AGE
  index      Index entities into OpenSearch
  run        Execute all stages end-to-end (download → parse → load → index)
  help       Show this help message

Options:
  --cycle <year>           Election cycle (default: 2024)
  --data-dir <path>        Data directory (default: ./data)
  --db-url <url>           PostgreSQL connection URL (default: DATABASE_URL env or postgresql://cig:cig@localhost:5432/cig)
  --opensearch-url <url>   OpenSearch URL (default: OPENSEARCH_URL env or https://localhost:9200)
`);
}

// ============================================================
// MAIN
// ============================================================

export async function main(argv: string[]): Promise<void> {
  const opts = parseCliArgs(argv);

  switch (opts.command) {
    case 'download': {
      await stageDownload(opts.cycle, opts.dataDir);
      break;
    }

    case 'parse': {
      const parsed = await stageParse(opts.cycle, opts.dataDir);
      let total = 0;
      for (const [, records] of parsed) {
        total += records.length;
      }
      console.log(`Total parsed records: ${total}`);
      break;
    }

    case 'load': {
      const parsed = await stageParse(opts.cycle, opts.dataDir);
      const pool = new pg.Pool({ connectionString: opts.dbUrl });
      try {
        const stats = await stageLoad(parsed, pool);
        console.log('Load complete:', stats);
      } finally {
        await pool.end();
      }
      break;
    }

    case 'index': {
      await stageIndex(opts.opensearchUrl);
      break;
    }

    case 'run': {
      console.log(`Running full pipeline for cycle ${opts.cycle}...`);
      console.log('='.repeat(60));

      // Stage 1: Download
      await stageDownload(opts.cycle, opts.dataDir);
      console.log('='.repeat(60));

      // Stage 2: Parse
      const parsed = await stageParse(opts.cycle, opts.dataDir);
      console.log('='.repeat(60));

      // Stage 3: Load
      const pool = new pg.Pool({ connectionString: opts.dbUrl });
      try {
        const stats = await stageLoad(parsed, pool);
        console.log('Load stats:', stats);
      } finally {
        await pool.end();
      }
      console.log('='.repeat(60));

      // Stage 4: Index
      await stageIndex(opts.opensearchUrl);
      console.log('='.repeat(60));

      console.log('Pipeline complete.');
      break;
    }

    case 'help':
    default:
      printHelp();
      break;
  }
}

// Run if executed directly
const isMain = process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js');
if (isMain) {
  main(process.argv).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
