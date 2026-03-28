/**
 * Background service worker (T070).
 * Fetches entity data from CIG API, maintains IndexedDB entity index,
 * and handles messages from content scripts and popup.
 */

export interface CachedEntity {
  id: string;
  name: string;
  entityType: string;
  variants: string[];
}

export interface EntitySummary {
  id: string;
  name: string;
  entityType: string;
  party: string | null;
  topSectors: Array<{ sector: string; amount: number }>;
  topDonors: Array<{ name: string; amount: number }>;
  totalRaised: number;
  voteCount: number;
}

const API_BASE = 'http://localhost:3001/api/v1';
const DB_NAME = 'cig-extension';
const STORE_NAME = 'entities';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================
// IndexedDB helpers
// ============================================================

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllEntities(): Promise<CachedEntity[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putEntities(entities: CachedEntity[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  for (const e of entities) {
    store.put(e);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// API fetch helpers
// ============================================================

export async function fetchEntityCache(): Promise<CachedEntity[]> {
  // Fetch top entities from search API to seed the cache
  const types = ['person', 'committee', 'organization'];
  const entities: CachedEntity[] = [];

  for (const type of types) {
    try {
      const res = await fetch(`${API_BASE}/search?q=*&type=${type}&page_size=100`);
      if (!res.ok) continue;
      const json = await res.json();
      const results = json.data?.results ?? [];
      for (const r of results) {
        entities.push({
          id: r.id,
          name: r.canonical_name,
          entityType: r.entity_type,
          variants: r.name_variants ?? [],
        });
      }
    } catch {
      // API may be unavailable — use stale cache
    }
  }

  return entities;
}

export async function fetchEntitySummary(id: string): Promise<EntitySummary | null> {
  try {
    const res = await fetch(`${API_BASE}/entities/${encodeURIComponent(id)}/dashboard`);
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.data;
    return {
      id: d.entity?.id ?? id,
      name: d.entity?.canonical_name ?? '',
      entityType: d.entity?.entity_type ?? '',
      party: d.entity?.party ?? null,
      topSectors: (d.funding_summary?.by_sector ?? []).slice(0, 5).map(
        (s: { sector: string; amount: number }) => ({ sector: s.sector, amount: s.amount }),
      ),
      topDonors: (d.funding_summary?.top_counterparties ?? []).slice(0, 5).map(
        (c: { name: string; amount: number }) => ({ name: c.name, amount: c.amount }),
      ),
      totalRaised: d.funding_summary?.total_received ?? 0,
      voteCount: d.voting_summary?.total_votes ?? 0,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Message handling
// ============================================================

export type WorkerMessage =
  | { type: 'GET_ENTITY_CACHE' }
  | { type: 'ENTITY_CLICKED'; payload: { id: string; name: string; entityType: string } }
  | { type: 'GET_SUMMARY'; payload: { id: string } };

export async function handleMessage(
  message: WorkerMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): Promise<void> {
  try {
  switch (message.type) {
    case 'GET_ENTITY_CACHE': {
      let entities = await getAllEntities();
      const lastRefresh = await getLastRefreshTime();
      if (entities.length === 0 || Date.now() - lastRefresh > CACHE_TTL_MS) {
        const fresh = await fetchEntityCache();
        if (fresh.length > 0) {
          await putEntities(fresh);
          await setLastRefreshTime(Date.now());
          entities = fresh;
        }
      }
      sendResponse({ entities });
      break;
    }

    case 'ENTITY_CLICKED': {
      const summary = await fetchEntitySummary(message.payload.id);
      // Store in session for popup to read
      await chrome.storage.session.set({ activeSummary: summary });
      sendResponse({ ok: true });
      break;
    }

    case 'GET_SUMMARY': {
      const summary = await fetchEntitySummary(message.payload.id);
      sendResponse({ summary });
      break;
    }
  }
  } catch (err) {
    sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

async function getLastRefreshTime(): Promise<number> {
  const result = await chrome.storage.local.get('lastRefresh');
  return result.lastRefresh ?? 0;
}

async function setLastRefreshTime(time: number): Promise<void> {
  await chrome.storage.local.set({ lastRefresh: time });
}

// Register listener
chrome.runtime.onMessage.addListener(
  (message: WorkerMessage, sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) => {
    handleMessage(message, sender, sendResponse);
    return true; // keep channel open for async response
  },
);
