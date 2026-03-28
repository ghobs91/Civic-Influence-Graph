/**
 * Offline query execution (T055).
 *
 * Provides IndexedDB-based data caching from the API and a local
 * Cypher-to-IndexedDB query translator for offline in-browser queries.
 */

// ============================================================
// TYPES
// ============================================================

export interface CachedEntity {
  id: string;
  label: string;
  name: string;
  properties: Record<string, unknown>;
  cached_at: string;
}

export interface CachedRelationship {
  id: string;
  source: string;
  target: string;
  label: string;
  properties: Record<string, unknown>;
  cached_at: string;
}

export interface CacheMeta {
  last_sync: string;
  entity_count: number;
  relationship_count: number;
  version: number;
}

export interface OfflineQueryResult {
  nodes: CachedEntity[];
  edges: CachedRelationship[];
  count: number;
}

// ============================================================
// INDEXEDDB CACHE
// ============================================================

const CACHE_DB_NAME = 'cig_offline';
const CACHE_DB_VERSION = 1;

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entities')) {
        const store = db.createObjectStore('entities', { keyPath: 'id' });
        store.createIndex('label', 'label', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('relationships')) {
        const store = db.createObjectStore('relationships', { keyPath: 'id' });
        store.createIndex('label', 'label', { unique: false });
        store.createIndex('source', 'source', { unique: false });
        store.createIndex('target', 'target', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// CACHE POPULATION
// ============================================================

/**
 * Populate the offline cache from API graph data.
 */
export async function populateCache(
  nodes: Array<{ id: string; label: string; name: string; properties: Record<string, unknown> }>,
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    properties: Record<string, unknown>;
  }>,
): Promise<CacheMeta> {
  const db = await openCacheDB();
  const now = new Date().toISOString();

  // Write entities
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('entities', 'readwrite');
    const store = tx.objectStore('entities');
    for (const node of nodes) {
      store.put({ ...node, cached_at: now });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Write relationships
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('relationships', 'readwrite');
    const store = tx.objectStore('relationships');
    for (const edge of edges) {
      store.put({ ...edge, cached_at: now });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Write meta
  const meta: CacheMeta = {
    last_sync: now,
    entity_count: nodes.length,
    relationship_count: edges.length,
    version: CACHE_DB_VERSION,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    store.put({ key: 'sync', ...meta });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return meta;
}

/**
 * Get cache metadata (last sync time, counts).
 */
export async function getCacheMeta(): Promise<CacheMeta | null> {
  const db = await openCacheDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    const request = store.get('sync');
    request.onsuccess = () => {
      const result = request.result;
      if (!result) {
        resolve(null);
      } else {
        resolve({
          last_sync: result.last_sync,
          entity_count: result.entity_count,
          relationship_count: result.relationship_count,
          version: result.version,
        });
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear the entire offline cache.
 */
export async function clearCache(): Promise<void> {
  const db = await openCacheDB();
  await Promise.all(
    ['entities', 'relationships', 'meta'].map(
      (storeName) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }),
    ),
  );
}

// ============================================================
// CYPHER-TO-INDEXEDDB QUERY TRANSLATOR
// ============================================================

/** Parsed components from a simple Cypher MATCH query. */
interface ParsedCypher {
  nodeLabel?: string;
  edgeLabel?: string;
  nameFilter?: string;
  limit: number;
}

/**
 * Parse a subset of Cypher into an IndexedDB query plan.
 * Supports: MATCH (n:Label), MATCH ()-[r:EDGE]-(), WHERE name = $v, LIMIT n
 */
export function parseCypher(cypher: string): ParsedCypher {
  const result: ParsedCypher = { limit: 50 };

  // Extract node label: (variable:Label)
  const nodeLabelMatch = /\(\w*:(\w+)\)/.exec(cypher);
  if (nodeLabelMatch) {
    result.nodeLabel = nodeLabelMatch[1];
  }

  // Extract edge label: [variable:LABEL]
  const edgeLabelMatch = /\[\w*:(\w+)\]/.exec(cypher);
  if (edgeLabelMatch) {
    result.edgeLabel = edgeLabelMatch[1];
  }

  // Extract name filter: WHERE ... name = $param or WHERE ... name = 'value'
  const nameFilterMatch = /\.name\s*=\s*(?:\$\w+|'([^']*)'|"([^"]*)")/i.exec(cypher);
  if (nameFilterMatch) {
    result.nameFilter = nameFilterMatch[1] ?? nameFilterMatch[2];
  }

  // Extract LIMIT
  const limitMatch = /LIMIT\s+(\d+)/i.exec(cypher);
  if (limitMatch) {
    result.limit = Math.min(parseInt(limitMatch[1], 10), 200);
  }

  return result;
}

/**
 * Execute a parsed Cypher query against the IndexedDB cache.
 */
export async function executeOfflineQuery(cypher: string): Promise<OfflineQueryResult> {
  const parsed = parseCypher(cypher);
  const db = await openCacheDB();

  let matchedNodes: CachedEntity[] = [];
  let matchedEdges: CachedRelationship[] = [];

  // Query entities by label
  if (parsed.nodeLabel) {
    matchedNodes = await new Promise((resolve, reject) => {
      const tx = db.transaction('entities', 'readonly');
      const store = tx.objectStore('entities');
      const index = store.index('label');
      const request = index.getAll(parsed.nodeLabel);
      request.onsuccess = () => resolve(request.result as CachedEntity[]);
      request.onerror = () => reject(request.error);
    });

    // Apply name filter
    if (parsed.nameFilter) {
      const filter = parsed.nameFilter.toLowerCase();
      matchedNodes = matchedNodes.filter((n) => n.name.toLowerCase().includes(filter));
    }
  } else {
    // No label filter — get all entities
    matchedNodes = await new Promise((resolve, reject) => {
      const tx = db.transaction('entities', 'readonly');
      const store = tx.objectStore('entities');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as CachedEntity[]);
      request.onerror = () => reject(request.error);
    });
  }

  // Query relationships by edge label
  if (parsed.edgeLabel) {
    matchedEdges = await new Promise((resolve, reject) => {
      const tx = db.transaction('relationships', 'readonly');
      const store = tx.objectStore('relationships');
      const index = store.index('label');
      const request = index.getAll(parsed.edgeLabel);
      request.onsuccess = () => resolve(request.result as CachedRelationship[]);
      request.onerror = () => reject(request.error);
    });
  }

  // Apply LIMIT
  matchedNodes = matchedNodes.slice(0, parsed.limit);
  matchedEdges = matchedEdges.slice(0, parsed.limit);

  return {
    nodes: matchedNodes,
    edges: matchedEdges,
    count: matchedNodes.length + matchedEdges.length,
  };
}

/**
 * Check if offline cache is available and populated.
 */
export async function isCacheAvailable(): Promise<boolean> {
  const meta = await getCacheMeta();
  return meta !== null && meta.entity_count > 0;
}
