import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Mock api-client for DrillDown
vi.mock('../lib/api-client.js', () => ({
  getDonations: vi.fn().mockResolvedValue({
    data: { donations: [] },
    meta: { request_id: '1', timestamp: '', data_snapshot: null, total_count: 0, page: 1, page_size: 20 },
  }),
  getLobbying: vi.fn(),
  getVotes: vi.fn(),
}));

import FundingSummary from '../components/dashboard/FundingSummary.js';
import LobbySummary from '../components/dashboard/LobbySummary.js';
import VotingSummary from '../components/dashboard/VotingSummary.js';

afterEach(() => {
  cleanup();
});

describe('FundingSummary', () => {
  // @vitest-environment jsdom

  it('renders totals', () => {
    render(
      <FundingSummary
        data={{
          total_received: 1500000,
          total_given: 50000,
          top_counterparties: [],
        }}
        entityId="e1"
      />,
    );

    expect(screen.getByText('$1,500,000')).toBeDefined();
    expect(screen.getByText('$50,000')).toBeDefined();
  });

  it('renders sector breakdown', () => {
    render(
      <FundingSummary
        data={{
          total_received: 0,
          total_given: 0,
          by_sector: [
            { sector: 'Finance', sector_id: 's1', amount: 200000, count: 15 },
            { sector: 'Health', sector_id: 's2', amount: 100000, count: 10 },
          ],
          top_counterparties: [],
        }}
        entityId="e1"
      />,
    );

    expect(screen.getByText('Finance')).toBeDefined();
    expect(screen.getByText('Health')).toBeDefined();
    expect(screen.getByText('$200,000')).toBeDefined();
  });

  it('renders top counterparties', () => {
    render(
      <FundingSummary
        data={{
          total_received: 0,
          total_given: 0,
          top_counterparties: [
            { entity_id: 'cp1', name: 'Big PAC', entity_type: 'committee', amount: 50000, count: 3 },
          ],
        }}
        entityId="e1"
      />,
    );

    expect(screen.getByText('Big PAC')).toBeDefined();
    expect(screen.getByText('committee')).toBeDefined();
  });

  it('has drill-down buttons for totals', () => {
    render(
      <FundingSummary
        data={{ total_received: 100, total_given: 50, top_counterparties: [] }}
        entityId="e1"
      />,
    );

    expect(screen.getByLabelText('Drill down into received funding')).toBeDefined();
    expect(screen.getByLabelText('Drill down into given funding')).toBeDefined();
  });
});

describe('LobbySummary', () => {
  it('renders engagements count', () => {
    render(
      <LobbySummary
        data={{
          engagements_mentioning: 15,
          top_clients: [{ org_id: 'o1', name: 'Corp A', engagement_count: 5 }],
          top_issues: ['Defense', 'Energy'],
        }}
      />,
    );

    expect(screen.getByText('15')).toBeDefined();
    expect(screen.getByText('Corp A')).toBeDefined();
    expect(screen.getByText('Defense')).toBeDefined();
    expect(screen.getByText('Energy')).toBeDefined();
  });

  it('renders message when no data', () => {
    render(<LobbySummary data={undefined} />);
    expect(screen.getByText('No lobbying data available.')).toBeDefined();
  });
});

describe('VotingSummary', () => {
  it('renders vote counts', () => {
    render(
      <VotingSummary
        data={{
          total_votes: 342,
          yea_votes: 310,
          nay_votes: 32,
          recent_votes: [],
        }}
      />,
    );

    expect(screen.getByText('342')).toBeDefined();
    expect(screen.getByText('310')).toBeDefined();
    expect(screen.getByText('32')).toBeDefined();
  });

  it('renders recent votes table', () => {
    render(
      <VotingSummary
        data={{
          total_votes: 10,
          yea_votes: 8,
          nay_votes: 2,
          recent_votes: [
            { bill_id: 'b1', bill_number: 'H.R.1234', vote_cast: 'yea', vote_date: '2025-03-15' },
            { bill_id: 'b2', bill_number: 'S.567', vote_cast: 'nay', vote_date: '2025-03-10' },
          ],
        }}
      />,
    );

    expect(screen.getByText('H.R.1234')).toBeDefined();
    expect(screen.getByText('S.567')).toBeDefined();
    expect(screen.getByText('yea')).toBeDefined();
    expect(screen.getByText('nay')).toBeDefined();
  });

  it('renders yea/nay ratio bar', () => {
    render(
      <VotingSummary
        data={{
          total_votes: 100,
          yea_votes: 70,
          nay_votes: 30,
          recent_votes: [],
        }}
      />,
    );

    expect(screen.getByRole('img', { name: /70 yea votes, 30 nay votes/ })).toBeDefined();
  });
});
