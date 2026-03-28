/**
 * Client-side audit log (T052).
 *
 * Stores AI query audit entries in IndexedDB for local persistence.
 * Entries can be synced to the server API via POST /ai/query.
 */

// ============================================================
// TYPES
// ============================================================

export interface AuditEntry {
  id: string;
  timestamp: string;
  natural_language_query: string;
  generated_query: string;
  query_params: Record<string, unknown>;
  model_id: string;
  model_version: string;
  execution_mode: 'api' | 'offline';
  result_count: number;
  summary_text?: string;
  client_info: {
    user_agent: string;
    session_id: string;
  };
}

// ============================================================
// SESSION ID
// ============================================================

let sessionId: string | null = null;

function getSessionId(): string {
  if (sessionId) return sessionId;
  // Use sessionStorage to persist within a tab session
  if (typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem('cig_session_id');
    if (stored) {
      sessionId = stored;
      return stored;
    }
  }
  sessionId = crypto.randomUUID();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('cig_session_id', sessionId);
  }
  return sessionId;
}

// ============================================================
// INDEXEDDB HELPERS
// ============================================================

const DB_NAME = 'cig_audit';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  const tx = db.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Save an audit entry to IndexedDB.
 */
export async function saveAuditEntry(
  entry: Omit<AuditEntry, 'id' | 'timestamp' | 'client_info'>,
): Promise<AuditEntry> {
  const full: AuditEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    client_info: {
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      session_id: getSessionId(),
    },
  };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, 'readwrite');
    const request = store.put(full);
    request.onsuccess = () => resolve(full);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all audit entries, newest first.
 */
export async function getAuditEntries(limit = 100): Promise<AuditEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, 'readonly');
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    const results: AuditEntry[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value as AuditEntry);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a single audit entry by ID.
 */
export async function getAuditEntry(id: string): Promise<AuditEntry | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, 'readonly');
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as AuditEntry) ?? null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete an audit entry by ID.
 */
export async function deleteAuditEntry(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, 'readwrite');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all audit entries.
 */
export async function clearAuditLog(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, 'readwrite');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Count total audit entries.
 */
export async function countAuditEntries(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = txStore(db, 'readonly');
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Build an audit entry payload for server sync.
 */
export function toServerPayload(entry: AuditEntry): Record<string, unknown> {
  return {
    natural_language_query: entry.natural_language_query,
    generated_query: entry.generated_query,
    query_params: entry.query_params,
    model_id: entry.model_id,
    model_version: entry.model_version,
    result_count: entry.result_count,
    client_info: entry.client_info,
  };
}
