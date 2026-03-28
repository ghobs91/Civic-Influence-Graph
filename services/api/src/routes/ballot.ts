/**
 * Ballot races API endpoint (T072).
 *   GET /api/v1/ballot/races — Retrieve ballot races for an address
 *
 * Address-based district lookup: extracts state from address, finds
 * candidates running in that state's districts, with compact influence summaries.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { buildMeta, sendResponse } from '../middleware/response.js';

export interface BallotDeps {
  pool: pg.Pool;
}

const BallotQuerySchema = z.object({
  address: z.string().min(1).max(500),
  state: z.string().max(2).optional(),
});

/**
 * Extract a US state abbreviation from an address string.
 * Looks for 2-letter state codes preceded by comma+space or at the end.
 */
export function extractState(address: string, explicitState?: string): string | null {
  if (explicitState && /^[A-Z]{2}$/i.test(explicitState)) {
    return explicitState.toUpperCase();
  }

  const STATES = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
  ]);

  const match = address.match(/\b([A-Z]{2})\b/gi);
  if (match) {
    for (const token of match.reverse()) {
      if (STATES.has(token.toUpperCase())) return token.toUpperCase();
    }
  }
  return null;
}

export function registerBallotRoutes(server: FastifyInstance, deps: BallotDeps): void {
  server.get(
    '/api/v1/ballot/races',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = BallotQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join('; '),
            request_id: request.id as string,
          },
        });
      }

      const { address, state: explicitState } = parsed.data;
      const state = extractState(address, explicitState);

      if (!state) {
        return reply.status(400).send({
          error: {
            code: 'STATE_NOT_FOUND',
            message: 'Could not determine state from address. Provide a state parameter.',
            request_id: request.id as string,
          },
        });
      }

      // Fetch candidates running in this state
      const candidateResult = await deps.pool.query<{
        id: string;
        canonical_name: string;
        party: string | null;
        office: string | null;
        district: string | null;
      }>(
        `SELECT p.id, p.canonical_name, p.party,
                (SELECT r->>'role' FROM jsonb_array_elements(
                  COALESCE(p.roles, '[]'::jsonb)
                ) r LIMIT 1) as office,
                (SELECT r->>'state' FROM jsonb_array_elements(
                  COALESCE(p.roles, '[]'::jsonb)
                ) r LIMIT 1) as district
         FROM person p
         WHERE $1 = ANY(p.jurisdictions)
         ORDER BY p.canonical_name
         LIMIT 100`,
        [state],
      );

      // Build races grouped by office
      const raceMap = new Map<string, Array<{
        entity_id: string;
        name: string;
        party: string | null;
        incumbent: boolean;
        summary: {
          total_raised: number;
          top_sectors: Array<{ sector: string; amount: number }>;
          top_donors: Array<{ name: string; amount: number }>;
        };
      }>>();

      for (const cand of candidateResult.rows) {
        const office = cand.office ?? 'Unknown';
        const raceKey = cand.district
          ? `${mapOffice(office)} - ${state}-${cand.district}`
          : `${mapOffice(office)} - ${state}`;

        if (!raceMap.has(raceKey)) raceMap.set(raceKey, []);

        // Fetch compact summary for each candidate
        const fundingResult = await deps.pool.query<{
          total_received: string;
        }>(
          `SELECT COALESCE(SUM(d.amount), 0)::text as total_received
           FROM donation d WHERE d.destination_entity_id = $1`,
          [cand.id],
        );

        const sectorResult = await deps.pool.query<{
          sector_name: string;
          total: string;
        }>(
          `SELECT s.name as sector_name, SUM(d.amount)::text as total
           FROM donation d
           JOIN organization o ON d.source_entity_id = o.id
           JOIN sector s ON o.sector_id = s.id
           WHERE d.destination_entity_id = $1
           GROUP BY s.name
           ORDER BY SUM(d.amount) DESC
           LIMIT 3`,
          [cand.id],
        );

        const donorResult = await deps.pool.query<{
          donor_name: string;
          total: string;
        }>(
          `SELECT COALESCE(
             (SELECT canonical_name FROM person WHERE id = d.source_entity_id),
             (SELECT name FROM committee WHERE id = d.source_entity_id),
             (SELECT name FROM organization WHERE id = d.source_entity_id),
             'Unknown'
           ) as donor_name,
           SUM(d.amount)::text as total
           FROM donation d
           WHERE d.destination_entity_id = $1
           GROUP BY d.source_entity_id
           ORDER BY SUM(d.amount) DESC
           LIMIT 3`,
          [cand.id],
        );

        raceMap.get(raceKey)!.push({
          entity_id: cand.id,
          name: cand.canonical_name,
          party: cand.party,
          incumbent: true,
          summary: {
            total_raised: parseFloat(fundingResult.rows[0]?.total_received ?? '0'),
            top_sectors: sectorResult.rows.map((r) => ({
              sector: r.sector_name,
              amount: parseFloat(r.total),
            })),
            top_donors: donorResult.rows.map((r) => ({
              name: r.donor_name,
              amount: parseFloat(r.total),
            })),
          },
        });
      }

      const races = Array.from(raceMap.entries()).map(([office, candidates]) => ({
        office,
        candidates,
      }));

      const meta = buildMeta(request, {
        total_count: races.length,
        page: 1,
        page_size: races.length,
      });

      return sendResponse(reply, { races }, meta);
    },
  );
}

function mapOffice(raw: string): string {
  switch (raw) {
    case 'representative': return 'US House';
    case 'senator': return 'US Senate';
    case 'president': return 'President';
    default: return raw;
  }
}
