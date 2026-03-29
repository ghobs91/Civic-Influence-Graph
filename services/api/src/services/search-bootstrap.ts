import { Client } from '@opensearch-project/opensearch';
import type { FastifyBaseLogger } from 'fastify';

const CIG_ENTITIES_INDEX = 'cig-entities';

const indexSettings = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      analyzer: {
        cig_name_analyzer: {
          type: 'custom' as const,
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding'],
        },
        cig_ngram_analyzer: {
          type: 'custom' as const,
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'cig_edge_ngram'],
        },
      },
      filter: {
        cig_edge_ngram: {
          type: 'edge_ngram' as const,
          min_gram: 2,
          max_gram: 15,
        },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: 'keyword' as const },
      entity_type: { type: 'keyword' as const },
      canonical_name: {
        type: 'text' as const,
        analyzer: 'cig_name_analyzer',
        fields: {
          ngram: { type: 'text' as const, analyzer: 'cig_ngram_analyzer' },
          keyword: { type: 'keyword' as const },
        },
      },
      name_variants: {
        type: 'text' as const,
        analyzer: 'cig_name_analyzer',
      },
      jurisdiction: { type: 'keyword' as const },
      sector: { type: 'keyword' as const },
      party: { type: 'keyword' as const },
      employer: { type: 'text' as const, analyzer: 'standard' },
      committee_name: {
        type: 'text' as const,
        analyzer: 'cig_name_analyzer',
      },
    },
  },
};

/**
 * Ensure the cig-entities index exists in OpenSearch.
 * Creates it with basic analyzers if missing. The phonetic analyzer
 * is omitted here since the analysis-phonetic plugin may not be installed;
 * the full ingest pipeline can recreate the index with phonetic support.
 */
export async function bootstrapSearchIndex(client: Client, log: FastifyBaseLogger): Promise<void> {
  try {
    const { body: exists } = await client.indices.exists({ index: CIG_ENTITIES_INDEX });
    if (exists) {
      log.info(`OpenSearch index "${CIG_ENTITIES_INDEX}" already exists`);
      return;
    }

    await client.indices.create({
      index: CIG_ENTITIES_INDEX,
      body: indexSettings,
    });
    log.info(`Created OpenSearch index "${CIG_ENTITIES_INDEX}"`);
  } catch (err) {
    log.warn({ err }, `Failed to bootstrap OpenSearch index "${CIG_ENTITIES_INDEX}" — search will return empty results until the index is available`);
  }
}
