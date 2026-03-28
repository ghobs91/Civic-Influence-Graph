import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import DrillDown from '../components/dashboard/DrillDown.js';

vi.mock('../lib/api-client.js', () => ({
  getDonations: vi.fn(),
  getLobbying: vi.fn(),
  getVotes: vi.fn(),
}));

import { getDonations, getLobbying, getVotes } from '../lib/api-client.js';
const mockGetDonations = getDonations as ReturnType<typeof vi.fn>;
const mockGetLobbying = getLobbying as ReturnType<typeof vi.fn>;
const mockGetVotes = getVotes as ReturnType<typeof vi.fn>;

const meta = {
  request_id: '00000000-0000-0000-0000-000000000001',
  timestamp: '2025-01-01T00:00:00Z',
  data_snapshot: null,
  total_count: 1,
  page: 1,
  page_size: 20,
};

beforeEach(() => {
  mockGetDonations.mockReset();
  mockGetLobbying.mockReset();
  mockGetVotes.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('DrillDown', () => {
  // @vitest-environment jsdom

  it('renders donations table', async () => {
    mockGetDonations.mockResolvedValue({
      data: {
        donations: [
          {
            id: 'd1',
            source_entity_id: 'aaaaaaaa-0000-0000-0000-000000000001',
            destination_entity_id: 'bbbbbbbb-0000-0000-0000-000000000001',
            amount: 2800,
            transaction_date: '2025-01-15',
            transaction_type: 'direct',
            election_cycle: '2026',
            filing_id: 'FEC-123',
            source_system: 'fec',
            source_record_id: 'rec-1',
          },
        ],
      },
      meta,
    });

    render(<DrillDown entityId="e1" type="donations" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('$2,800')).toBeDefined();
    });

    expect(screen.getByText('FEC-123')).toBeDefined();
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('renders lobbying table', async () => {
    mockGetLobbying.mockResolvedValue({
      data: {
        lobbying_engagements: [
          {
            id: 'l1',
            registrant_id: 'r1',
            client_id: 'c1',
            filing_type: 'LDA',
            filing_date: '2025-02-01',
            amount: 100000,
            issues: ['Energy', 'Tax'],
            lobbyists: [],
            government_entities: [],
            source_system: 'lda',
            source_record_id: 'lr-1',
          },
        ],
      },
      meta,
    });

    render(<DrillDown entityId="e1" type="lobbying" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('LDA')).toBeDefined();
    });

    expect(screen.getByText('Energy, Tax')).toBeDefined();
    expect(screen.getByText('$100,000')).toBeDefined();
  });

  it('renders votes table', async () => {
    mockGetVotes.mockResolvedValue({
      data: {
        votes: [
          {
            id: 'v1',
            person_id: 'p1',
            bill_id: 'b1',
            bill_number: 'H.R.999',
            bill_title: 'Test Bill',
            vote_cast: 'yea',
            vote_date: '2025-03-01',
            session: '119th',
            roll_call_number: '42',
            source_system: 'congress',
            source_record_id: 'vr-1',
          },
        ],
      },
      meta,
    });

    render(<DrillDown entityId="e1" type="votes" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('H.R.999')).toBeDefined();
    });

    expect(screen.getByText('Test Bill')).toBeDefined();
  });

  it('calls onClose when close button clicked', async () => {
    mockGetDonations.mockResolvedValue({ data: { donations: [] }, meta: { ...meta, total_count: 0 } });
    const onClose = vi.fn();

    render(<DrillDown entityId="e1" type="donations" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('No records found.')).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows error on failure', async () => {
    mockGetDonations.mockRejectedValue(new Error('Network failure'));

    render(<DrillDown entityId="e1" type="donations" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Network failure')).toBeDefined();
    });
  });

  it('paginates when more pages', async () => {
    mockGetDonations
      .mockResolvedValueOnce({
        data: {
          donations: [
            { id: 'd1', source_entity_id: 'aaaa0000-0000-0000-0000-000000000001', destination_entity_id: 'bbbb0000-0000-0000-0000-000000000001', amount: 100, transaction_date: '2025-01-01', transaction_type: 'direct', election_cycle: '2026', filing_id: 'F1', source_system: 'fec', source_record_id: 'r1' },
          ],
        },
        meta: { ...meta, total_count: 40, page: 1, page_size: 20 },
      })
      .mockResolvedValueOnce({
        data: {
          donations: [
            { id: 'd2', source_entity_id: 'cccc0000-0000-0000-0000-000000000001', destination_entity_id: 'dddd0000-0000-0000-0000-000000000001', amount: 200, transaction_date: '2025-02-01', transaction_type: 'direct', election_cycle: '2026', filing_id: 'F2', source_system: 'fec', source_record_id: 'r2' },
          ],
        },
        meta: { ...meta, total_count: 40, page: 2, page_size: 20 },
      });

    render(<DrillDown entityId="e1" type="donations" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeDefined();
    });
  });
});
