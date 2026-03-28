/**
 * Lightweight HTTP admin server for the P2P node.
 * Exposes feed status, seed control, and follow endpoints so the
 * main API service can proxy /replication routes to this service.
 *
 * Runs on P2P_ADMIN_PORT (default 3002), only accessible within
 * the Docker network.
 */

import http from 'node:http';
import { getFeedInfos, initFeeds, closeFeeds, type FeedSet } from './feeds.js';
import { createDiscovery, type DiscoveryManager } from './sync/discovery.js';

const seedingFeeds = new Set<string>();
let discovery: DiscoveryManager | null = null;
let feedSet: FeedSet | null = null;

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function createAdminServer(): http.Server {
  return http.createServer(async (req, res) => {
    const { method, url } = req;

    try {
      // GET /feeds
      if (method === 'GET' && url === '/feeds') {
        const infos = await getFeedInfos();
        const feeds = infos.map((info) => ({
          name: info.name,
          publicKey: info.publicKey,
          length: info.length,
          seeding: seedingFeeds.has(info.name),
          peers: discovery?.peerCount ?? 0,
          bytesUploaded: 0,
          lastSync: null,
        }));
        return json(res, 200, { feeds });
      }

      // POST /feeds/:name/seed
      const seedMatch = url?.match(/^\/feeds\/([^/]+)\/seed$/);
      if (method === 'POST' && seedMatch) {
        const name = decodeURIComponent(seedMatch[1]);
        const body = await parseBody(req);
        const action = (body.action as string) ?? 'start';
        if (action === 'stop') {
          seedingFeeds.delete(name);
        } else {
          seedingFeeds.add(name);
        }
        return json(res, 200, { name, seeding: action !== 'stop' });
      }

      // POST /feeds/follow
      if (method === 'POST' && url === '/feeds/follow') {
        const body = await parseBody(req);
        const publicKey = body.public_key as string | undefined;
        if (!publicKey || !/^[0-9a-f]{64}$/i.test(publicKey)) {
          return json(res, 400, { error: 'public_key must be 64 hex characters' });
        }
        if (!feedSet) {
          return json(res, 503, { error: 'P2P node not ready' });
        }
        const core = feedSet.store.get(Buffer.from(publicKey, 'hex'));
        await core.ready();
        const name = core.key?.toString('hex').slice(0, 16) ?? 'remote';
        return json(res, 201, { name });
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      json(res, 500, { error: message });
    }
  });
}

/**
 * Start the admin server and the P2P feeds + discovery.
 */
export async function startAdminServer(
  dataDir: string,
  port: number = parseInt(process.env.P2P_ADMIN_PORT || '3002', 10),
): Promise<void> {
  feedSet = await initFeeds(dataDir);
  discovery = createDiscovery(feedSet);
  await discovery.start();

  const server = createAdminServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`P2P admin API listening on port ${port}`);
  });

  const shutdown = async () => {
    console.log('\nShutting down P2P node...');
    server.close();
    if (discovery) {
      await discovery.stop();
      discovery = null;
    }
    await closeFeeds();
    feedSet = null;
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
