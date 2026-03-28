/**
 * Search API route (GET /search).
 *
 * Full-text entity search against OpenSearch with fuzzy + phonetic matching,
 * type/jurisdiction/sector filters, and pagination.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Client } from '@opensearch-project/opensearch';
import { SearchQuerySchema } from '@cig/schema';
import { buildMeta, sendResponse } from '../middleware/response.js';

const CIG_ENTITIES_INDEX = 'cig-entities';

export interface SearchDeps {
  opensearch: Client;
}

export function buildSearchQuery(params: {
  q: string;
  type?: string;
  jurisdiction?: string;
  sector?: string;
  page: number;
  page_size: number;
}) {
  const must: object[] = [
    {
      multi_match: {
        query: params.q,
        fields: [
          'canonical_name^3',
          'canonical_name.phonetic^2',
          'canonical_name.ngram',
          'name_variants^2',
          'name_variants.phonetic',
          'committee_name',
        ],
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    },
  ];

  const filter: object[] = [];

  if (params.type) {
    filter.push({ term: { entity_type: params.type } });
  }
  if (params.jurisdiction) {
    filter.push({ term: { jurisdiction: params.jurisdiction } });
  }
  if (params.sector) {
    filter.push({ term: { sector: params.sector } });
  }

  return {
    query: {
      bool: {
        must,
        filter,
      },
    },
    from: (params.page - 1) * params.page_size,
    size: params.page_size,
  };
}

export function registerSearchRoute(server: FastifyInstance, deps: SearchDeps): void {
  server.get('/api/v1/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = SearchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          request_id: request.id as string,
        },
      });
    }

    const params = parsed.data;

    const searchBody = buildSearchQuery(params);
    const { body } = await deps.opensearch.search({
      index: CIG_ENTITIES_INDEX,
      body: searchBody,
    });

    const total =
      typeof body.hits.total === 'number' ? body.hits.total : body.hits.total?.value ?? 0;

    const results = (body.hits.hits as Array<{ _id: string; _source: Record<string, unknown>; _score: number }>).map(
      (hit) => ({
        id: hit._source.id ?? hit._id,
        entity_type: hit._source.entity_type,
        canonical_name: hit._source.canonical_name,
        name_variants: hit._source.name_variants ?? [],
        jurisdiction: hit._source.jurisdiction ?? null,
        party: hit._source.party ?? null,
        roles: hit._source.roles ?? [],
        relevance_score: hit._score,
      }),
    );

    const meta = buildMeta(request, {
      total_count: total,
      page: params.page,
      page_size: params.page_size,
    });

    return sendResponse(reply, { results }, meta);
  });
}
