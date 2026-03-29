import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../lib/api-client.js', () => ({
  getLeaderboard: vi.fn(),
}));

import DonationLeaderboard from '../components/dashboard/DonationLeaderboard.js';
import { getLeaderboard } from '../lib/api-client.js';

const mockGetLeaderboard = getLeaderboard as ReturnType<typeof vi.fn>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MOCK_ENTRIES = [
  {
    entity_id: 'e1',
    entity_type: 'committee',
    name: 'AIPAC PAC',
    committee_type: 'pac',
    total_amount: 5000000,
    donation_count: 1200,
  },
  {
    entity_id: 'e2',
    entity_type: 'committee',
    name: 'Club for Growth',
    committee_type: 'super_pac',
    total_amount: 3000000,
    donation_count: 800,
  },
  {
    entity_id: 'e3',
    entity_type: 'person',
    name: 'George Soros',
    committee_type: null,
    total_amount: 1500000,
    donation_count: 50,
  },
];

function mockSuccess(entries = MOCK_ENTRIES) {
  mockGetLeaderboard.mockResolvedValue({
    data: { entries },
    meta: {
      request_id: 'r1',
      timestamp: '2024-01-01T00:00:00Z',
      data_snapshot: null,
      total_count: entries.length,
      page: 1,
      page_size: 25,
    },
  });
}

describe('DonationLeaderboard', () => {
  // @vitest-environment jsdom

  it('renders leaderboard entries', async () => {
    mockSuccess();

    render(<DonationLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText('AIPAC PAC')).toBeDefined();
    });

    expect(screen.getByText('Club for Growth')).toBeDefined();
    expect(screen.getByText('George Soros')).toBeDefined();
    expect(screen.getByText('$5,000,000')).toBeDefined();
    expect(screen.getByText('$3,000,000')).toBeDefined();
    expect(screen.getByText('Top Donors')).toBeDefined();
  });

  it('shows loading state initially', () => {
    mockGetLeaderboard.mockReturnValue(new Promise(() => {})); // never resolves
    render(<DonationLeaderboard />);
    expect(screen.getByText(/Loading leaderboard/)).toBeDefined();
  });

  it('shows error state on API failure', async () => {
    mockGetLeaderboard.mockRejectedValue(new Error('Network error'));

    render(<DonationLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeDefined();
    });
  });

  it('shows empty state when no results', async () => {
    mockSuccess([]);

    render(<DonationLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText(/No donation data found/)).toBeDefined();
    });
  });

  it('passes entity_type filter to API', async () => {
    mockSuccess();

    render(<DonationLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText('AIPAC PAC')).toBeDefined();
    });

    const entitySelect = screen.getByLabelText('Filter by entity type');
    fireEvent.change(entitySelect, { target: { value: 'committee' } });

    await waitFor(() => {
      const lastCall = mockGetLeaderboard.mock.calls[mockGetLeaderboard.mock.calls.length - 1][0];
      expect(lastCall.entity_type).toBe('committee');
    });
  });

  it('shows committee type filter only when entity type is committee', async () => {
    mockSuccess();

    render(<DonationLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText('AIPAC PAC')).toBeDefined();
    });

    // Committee type filter should not be visible initially
    expect(screen.queryByLabelText('Filter by committee type')).toBeNull();

    // Select committee entity type
    const entitySelect = screen.getByLabelText('Filter by entity type');
    fireEvent.change(entitySelect, { target: { value: 'committee' } });

    // Now committee type filter should appear
    await waitFor(() => {
      expect(screen.getByLabelText('Filter by committee type')).toBeDefined();
    });
  });

  it('renders entity links to entity detail page', async () => {
    mockSuccess();

    render(<DonationLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText('AIPAC PAC')).toBeDefined();
    });

    const link = screen.getByText('AIPAC PAC').closest('a');
    expect(link?.getAttribute('href')).toBe('/entities/e1');
  });

  it('displays rank numbers', async () => {
    mockSuccess();

    render(<DonationLeaderboard />);

    await waitFor(() => {
      expect(screen.getByText('AIPAC PAC')).toBeDefined();
    });

    // Ranks 1, 2, 3 should appear as cell content
    const cells = screen.getAllByRole('cell');
    const rankCells = cells.filter((c) => ['1', '2', '3'].includes(c.textContent ?? ''));
    expect(rankCells.length).toBeGreaterThanOrEqual(3);
  });
});
