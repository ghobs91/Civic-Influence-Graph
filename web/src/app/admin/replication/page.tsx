'use client';

import { useState, useEffect, useCallback } from 'react';

interface FeedStatus {
  name: string;
  public_key: string;
  topic: string;
  length: number;
  seeding: boolean;
  peers: number;
  bytes_uploaded: number;
  last_sync: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export default function ReplicationAdminPage() {
  const [feeds, setFeeds] = useState<FeedStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followKey, setFollowKey] = useState('');
  const [followStatus, setFollowStatus] = useState<string | null>(null);

  const fetchFeeds = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/replication/feeds`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setFeeds(json.data?.feeds ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feeds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeeds();
    const interval = setInterval(fetchFeeds, 10_000);
    return () => clearInterval(interval);
  }, [fetchFeeds]);

  async function toggleSeed(name: string, currentlySeeding: boolean) {
    try {
      await fetch(`${API_BASE}/replication/feeds/${encodeURIComponent(name)}/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: currentlySeeding ? 'stop' : 'start' }),
      });
      await fetchFeeds();
    } catch {
      setError('Failed to toggle seeding');
    }
  }

  async function handleFollow(e: React.FormEvent) {
    e.preventDefault();
    if (!followKey.trim()) return;
    setFollowStatus(null);

    try {
      const res = await fetch(`${API_BASE}/replication/feeds/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: followKey.trim() }),
      });
      if (!res.ok) {
        const json = await res.json();
        setFollowStatus(`Error: ${json.error?.message ?? res.statusText}`);
        return;
      }
      setFollowStatus('Now following feed');
      setFollowKey('');
      await fetchFeeds();
    } catch {
      setFollowStatus('Failed to follow feed');
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Replication Admin</h1>

      {error && (
        <div role="alert" style={{ color: '#c00', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading feeds...</p>
      ) : (
        <table data-testid="feeds-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ccc' }}>Feed</th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ccc' }}>Public Key</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #ccc' }}>Entries</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #ccc' }}>Peers</th>
              <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #ccc' }}>Uploaded</th>
              <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #ccc' }}>Last Sync</th>
              <th style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '2px solid #ccc' }}>Seeding</th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed) => (
              <tr key={feed.name}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{feed.name}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {feed.public_key?.slice(0, 16)}...
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'right' }}>{feed.length.toLocaleString()}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'right' }}>{feed.peers}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatBytes(feed.bytes_uploaded)}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  {feed.last_sync ? new Date(feed.last_sync).toLocaleString() : '—'}
                </td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                  <button
                    onClick={() => toggleSeed(feed.name, feed.seeding)}
                    style={{
                      padding: '0.25rem 0.75rem',
                      background: feed.seeding ? '#c00' : '#0a0',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    {feed.seeding ? 'Stop' : 'Seed'}
                  </button>
                </td>
              </tr>
            ))}
            {feeds.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                  No feeds configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: '2rem' }}>Follow Remote Feed</h2>
      <form onSubmit={handleFollow} style={{ display: 'flex', gap: '0.5rem', maxWidth: '600px' }}>
        <input
          type="text"
          value={followKey}
          onChange={(e) => setFollowKey(e.target.value)}
          placeholder="Enter 64-character hex public key"
          aria-label="Feed public key"
          style={{ flex: 1, padding: '0.5rem', fontFamily: 'monospace' }}
        />
        <button
          type="submit"
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Follow
        </button>
      </form>
      {followStatus && <p style={{ marginTop: '0.5rem' }}>{followStatus}</p>}
    </div>
  );
}
