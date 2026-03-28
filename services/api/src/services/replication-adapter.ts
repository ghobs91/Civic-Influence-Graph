/**
 * HTTP-based P2P replication adapter.
 * Proxies ReplicationDeps calls to the P2P admin server over HTTP.
 * Uses Node 20's built-in fetch — no additional dependencies.
 */

import type { ReplicationDeps, FeedStatus } from '../routes/replication.js';

export function createReplicationAdapter(baseUrl: string): ReplicationDeps {
  return {
    async getFeedStatuses(): Promise<FeedStatus[]> {
      const res = await fetch(`${baseUrl}/feeds`);
      if (!res.ok) return [];
      const data = (await res.json()) as { feeds: FeedStatus[] };
      return data.feeds;
    },

    async startSeeding(name: string): Promise<void> {
      await fetch(`${baseUrl}/feeds/${encodeURIComponent(name)}/seed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
    },

    async stopSeeding(name: string): Promise<void> {
      await fetch(`${baseUrl}/feeds/${encodeURIComponent(name)}/seed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
    },

    async followFeed(publicKey: string): Promise<{ name: string }> {
      const res = await fetch(`${baseUrl}/feeds/follow`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ public_key: publicKey }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `P2P follow failed: ${res.status}`);
      }
      return (await res.json()) as { name: string };
    },
  };
}

export function createNoopReplication(): ReplicationDeps {
  return {
    async getFeedStatuses(): Promise<FeedStatus[]> {
      return [];
    },
    async startSeeding(): Promise<void> {
      /* no-op */
    },
    async stopSeeding(): Promise<void> {
      /* no-op */
    },
    async followFeed(): Promise<{ name: string }> {
      throw new Error('P2P node not configured — set P2P_ADMIN_URL to enable replication');
    },
  };
}
