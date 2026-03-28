/**
 * Ballot Explorer component (T073).
 * Address input, race list with compact influence cards per candidate.
 */

import { useState } from 'react';
import { formatCurrency, SummaryCard } from '../popup/SummaryCard.js';

export interface BallotCandidate {
  entity_id: string;
  name: string;
  party: string | null;
  incumbent: boolean;
  summary: {
    total_raised: number;
    top_sectors: Array<{ sector: string; amount: number }>;
    top_donors: Array<{ name: string; amount: number }>;
  };
}

export interface BallotRace {
  office: string;
  candidates: BallotCandidate[];
}

const API_BASE = 'http://localhost:3001/api/v1';

export function BallotExplorer() {
  const [address, setAddress] = useState('');
  const [races, setRaces] = useState<BallotRace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;

    setLoading(true);
    setError(null);
    setRaces([]);

    try {
      const res = await fetch(
        `${API_BASE}/ballot/races?address=${encodeURIComponent(address.trim())}`,
      );
      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      setRaces(json.data?.races ?? []);
    } catch {
      setError('Failed to fetch ballot data');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '8px' }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter your address"
          aria-label="Street address"
          style={{ flex: 1, padding: '6px', fontSize: '13px' }}
        />
        <button type="submit" disabled={loading} style={{ padding: '6px 12px', fontSize: '13px' }}>
          {loading ? '...' : 'Look up'}
        </button>
      </form>

      {error && (
        <div role="alert" style={{ color: '#c00', marginBottom: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {races.length === 0 && !loading && !error && address && (
        <p style={{ color: '#999', fontSize: '13px' }}>No races found for this address.</p>
      )}

      {races.map((race) => (
        <div key={race.office} style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', margin: '0 0 8px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }}>
            {race.office}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {race.candidates.map((c) => (
              <SummaryCard
                key={c.entity_id}
                id={c.entity_id}
                name={c.name}
                entityType="person"
                party={c.party}
                topSectors={c.summary.top_sectors}
                topDonors={c.summary.top_donors}
                totalRaised={c.summary.total_raised}
                voteCount={0}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export { formatCurrency };
