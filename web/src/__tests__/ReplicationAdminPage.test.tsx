// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ReplicationAdminPage from '../app/admin/replication/page';

afterEach(() => cleanup());

describe('ReplicationAdminPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    // Mock fetch to never resolve
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    render(<ReplicationAdminPage />);
    expect(screen.getByText('Loading feeds...')).toBeTruthy();
  });

  it('renders feed table after fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            feeds: [
              {
                name: 'cig-entities',
                public_key: 'ab'.repeat(32),
                topic: 'cd'.repeat(32),
                length: 1500,
                seeding: true,
                peers: 5,
                bytes_uploaded: 4200000000,
                last_sync: '2026-03-25T18:00:00Z',
              },
            ],
          },
        }),
    } as any);

    render(<ReplicationAdminPage />);
    // Wait for data to load
    const name = await screen.findByText('cig-entities');
    expect(name).toBeTruthy();
    expect(screen.getByText('1,500')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('Stop')).toBeTruthy();
  });

  it('shows empty state when no feeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { feeds: [] } }),
    } as any);

    render(<ReplicationAdminPage />);
    const empty = await screen.findByText('No feeds configured');
    expect(empty).toBeTruthy();
  });

  it('shows error on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));

    render(<ReplicationAdminPage />);
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('Network down');
  });

  it('has follow form with public key input', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { feeds: [] } }),
    } as any);

    render(<ReplicationAdminPage />);
    await screen.findByText('No feeds configured');

    const input = screen.getByLabelText('Feed public key');
    expect(input).toBeTruthy();
    expect(screen.getByText('Follow')).toBeTruthy();
  });
});
