import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SearchPage from '../app/search/page.js';

// Mock the api-client module
vi.mock('../lib/api-client.js', () => ({
  search: vi.fn(),
  ApiClientError: class extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown) {
      super('error');
      this.status = status;
      this.body = body;
    }
  },
}));

import { search as mockSearchFn } from '../lib/api-client.js';
const mockSearch = mockSearchFn as ReturnType<typeof vi.fn>;

const meta = {
  request_id: '00000000-0000-0000-0000-000000000001',
  timestamp: '2025-01-01T00:00:00Z',
  data_snapshot: null,
  total_count: 2,
  page: 1,
  page_size: 20,
};

beforeEach(() => {
  mockSearch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function getSearchInput() {
  return screen.getByRole('searchbox');
}

describe('SearchPage', () => {
  // @vitest-environment jsdom

  it('renders search form', () => {
    render(<SearchPage />);
    expect(getSearchInput()).toBeDefined();
    expect(screen.getByLabelText('Entity type filter')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDefined();
  });

  it('submits search and displays results', async () => {
    mockSearch.mockResolvedValue({
      data: {
        results: [
          { id: '1', entity_type: 'person', canonical_name: 'Jane Doe', relevance_score: 0.95, jurisdiction: 'CA', party: 'D' },
          { id: '2', entity_type: 'committee', canonical_name: 'PAC Fund', relevance_score: 0.8 },
        ],
      },
      meta,
    });

    render(<SearchPage />);

    fireEvent.change(getSearchInput(), { target: { value: 'jane' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeDefined();
    });

    expect(screen.getByText('PAC Fund')).toBeDefined();
    expect(screen.getByText('2 results found')).toBeDefined();
    expect(mockSearch).toHaveBeenCalledWith({ q: 'jane', type: undefined, page: 1 });
  });

  it('passes type filter to search', async () => {
    mockSearch.mockResolvedValue({ data: { results: [] }, meta: { ...meta, total_count: 0 } });

    render(<SearchPage />);

    fireEvent.change(getSearchInput(), { target: { value: 'test' } });
    fireEvent.change(screen.getByLabelText('Entity type filter'), { target: { value: 'person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith({ q: 'test', type: 'person', page: 1 });
    });
  });

  it('shows no results message', async () => {
    mockSearch.mockResolvedValue({ data: { results: [] }, meta: { ...meta, total_count: 0 } });

    render(<SearchPage />);

    fireEvent.change(getSearchInput(), { target: { value: 'xyz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('No results found.')).toBeDefined();
    });
  });

  it('shows error on failure', async () => {
    mockSearch.mockRejectedValue(new Error('Network error'));

    render(<SearchPage />);

    fireEvent.change(getSearchInput(), { target: { value: 'fail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('renders pagination when multi-page', async () => {
    mockSearch.mockResolvedValue({
      data: {
        results: [{ id: '1', entity_type: 'person', canonical_name: 'A', relevance_score: 1 }],
      },
      meta: { ...meta, total_count: 50, page: 1, page_size: 20 },
    });

    render(<SearchPage />);

    fireEvent.change(getSearchInput(), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeDefined();
    });

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDefined();
  });

  it('navigates to next page', async () => {
    mockSearch
      .mockResolvedValueOnce({
        data: { results: [{ id: '1', entity_type: 'person', canonical_name: 'A', relevance_score: 1 }] },
        meta: { ...meta, total_count: 50, page: 1, page_size: 20 },
      })
      .mockResolvedValueOnce({
        data: { results: [{ id: '2', entity_type: 'person', canonical_name: 'B', relevance_score: 0.9 }] },
        meta: { ...meta, total_count: 50, page: 2, page_size: 20 },
      });

    render(<SearchPage />);

    fireEvent.change(getSearchInput(), { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByText('A')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => {
      expect(screen.getByText('B')).toBeDefined();
    });

    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSearch).toHaveBeenLastCalledWith({ q: 'test', type: undefined, page: 2 });
  });

  it('displays entity type badges and metadata', async () => {
    mockSearch.mockResolvedValue({
      data: {
        results: [
          { id: '1', entity_type: 'person', canonical_name: 'Smith', relevance_score: 1, jurisdiction: 'federal', party: 'R' },
        ],
      },
      meta: { ...meta, total_count: 1 },
    });

    render(<SearchPage />);

    fireEvent.change(getSearchInput(), { target: { value: 'smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(1);
      expect(listItems[0].textContent).toContain('Person');
      expect(listItems[0].textContent).toContain('federal');
      expect(listItems[0].textContent).toContain('R');
    });
  });
});
