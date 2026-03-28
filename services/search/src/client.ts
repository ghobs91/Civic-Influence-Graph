import { Client } from '@opensearch-project/opensearch';
import { CIG_ENTITIES_INDEX, indexSettings } from './index-config.js';

let clientInstance: Client | null = null;

export function getOpenSearchClient(): Client {
  if (!clientInstance) {
    const node = process.env.OPENSEARCH_URL || 'http://localhost:9200';
    clientInstance = new Client({ node });
  }
  return clientInstance;
}

/**
 * Bootstrap the cig-entities index if it doesn't exist.
 * Installs the phonetic analysis plugin check is deferred to runtime.
 */
export async function bootstrapIndex(): Promise<void> {
  const client = getOpenSearchClient();

  const { body: exists } = await client.indices.exists({ index: CIG_ENTITIES_INDEX });
  if (exists) {
    return;
  }

  await client.indices.create({
    index: CIG_ENTITIES_INDEX,
    body: indexSettings,
  });
}

/**
 * Delete and recreate the index (for development/testing).
 */
export async function resetIndex(): Promise<void> {
  const client = getOpenSearchClient();

  const { body: exists } = await client.indices.exists({ index: CIG_ENTITIES_INDEX });
  if (exists) {
    await client.indices.delete({ index: CIG_ENTITIES_INDEX });
  }

  await client.indices.create({
    index: CIG_ENTITIES_INDEX,
    body: indexSettings,
  });
}
