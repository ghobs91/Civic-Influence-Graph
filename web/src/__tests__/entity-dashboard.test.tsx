import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ent-001' }),
}));

// Mock api-client
vi.mock('../lib/api-client.js', () => ({
  getEntity: vi.fn(),
  getDashboard: vi.fn(),
}));

// Mock child components to isolate page logic
vi.mock('../components/dashboard/FundingSummary.js', () => ({
  default: ({ data }: { data: unknown }) => (
    <div data-testid="funding-summary">{data ? 'Funding loaded' : 'No funding'}</div>
  ),
}));
vi.mock('../components/dashboard/LobbySummary.js', () => ({
  default: ({ data }: { data: unknown }) => (
    <div data-testid="lobby-summary">{data ? 'Lobby loaded' : 'No lobby'}</div>
  ),
}));
vi.mock('../components/dashboard/VotingSummary.js', () => ({
  default: ({ data }: { data: unknown }) => (
    <div data-testid="voting-summary">{data ? 'Voting loaded' : 'No voting'}</div>
  ),
}));

import { getEntity, getDashboard } from '../lib/api-client.js';
const mockGetEntity = getEntity as ReturnType<typeof vi.fn>;
const mockGetDashboard = getDashboard as ReturnType<typeof vi.fn>;

import EntityDashboardPage from '../app/entities/[id]/page.js';

const mockEntity = {
  id: 'ent-001',
  canonical_name: 'Jane Doe',
  entity_type: 'person',
  party: 'Independent',
  jurisdictions: ['US-CA'],
  aliases: [],
  identifiers: {},
};

const mockDashboard = {
  funding_summary: {
    total_received: 50000,
    total_given: 10000,
    by_sector: [],
    top_counterparties: [],
  },
  lobbying_summary: {
    engagements_mentioning: 3,
    top_clients: [],
    top_issues: [],
  },
  voting_summary: {
    total_votes: 100,
    yea_count: 60,
    nay_count: 30,
    recent_votes: [],
  },
};

const meta = {
  request_id: '00000000-0000-0000-0000-000000000001',
  timestamp: '2025-01-01T00:00:00Z',
  data_snapshot: null,
};

function setupMocks() {
  mockGetEntity.mockResolvedValue({ data: mockEntity, meta });
  mockGetDashboard.mockResolvedValue({ data: mockDashboard, meta });
}

beforeEach(() => {
  mockGetEntity.mockReset();
  mockGetDashboard.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('EntityDashboardPage', () => {
  // @vitest-environment jsdom

  it('renders entity header after loading', async () => {
    setupMocks();
    render(<EntityDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeDefined();
    });

    expect(screen.getByText(/Independent/)).toBeDefined();
    expect(screen.getByText(/US-CA/)).toBeDefined();
  });

  it('shows loading state initially', () => {
    // Never resolve the promises
    mockGetEntity.mockReturnValue(new Promise(() => {}));
    mockGetDashboard.mockReturnValue(new Promise(() => {}));

    render(<EntityDashboardPage />);
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('shows error on failure', async () => {
    mockGetEntity.mockRejectedValue(new Error('Entity not found'));
    mockGetDashboard.mockRejectedValue(new Error('Entity not found'));

    render(<EntityDashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Entity not found')).toBeDefined();
    });
  });

  it('shows funding tab by default', async () => {
    setupMocks();
    render(<EntityDashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('funding-summary')).toBeDefined();
    });

    expect(screen.getByText('Funding loaded')).toBeDefined();
    // Funding tab should be selected
    const fundingTab = screen.getByRole('tab', { name: 'Funding' });
    expect(fundingTab.getAttribute('aria-selected')).toBe('true');
  });

  it('switches to lobbying tab on click', async () => {
    setupMocks();
    render(<EntityDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Lobbying' }));

    await waitFor(() => {
      expect(screen.getByTestId('lobby-summary')).toBeDefined();
    });

    expect(screen.getByText('Lobby loaded')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Lobbying' }).getAttribute('aria-selected')).toBe('true');
  });

  it('switches to votes tab on click', async () => {
    setupMocks();
    render(<EntityDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Votes' }));

    await waitFor(() => {
      expect(screen.getByTestId('voting-summary')).toBeDefined();
    });

    expect(screen.getByText('Voting loaded')).toBeDefined();
  });

  it('has date range filter inputs', async () => {
    setupMocks();
    render(<EntityDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeDefined();
    });

    expect(screen.getByText('From:')).toBeDefined();
    expect(screen.getByText('To:')).toBeDefined();
  });
});
