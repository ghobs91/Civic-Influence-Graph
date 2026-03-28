import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FilterPanel from '../components/graph/FilterPanel.js';

afterEach(() => {
  cleanup();
});

describe('FilterPanel', () => {
  // @vitest-environment jsdom

  it('renders all filter inputs', () => {
    render(<FilterPanel onApply={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByLabelText(/Start Date/i)).toBeDefined();
    expect(screen.getByLabelText(/End Date/i)).toBeDefined();
    expect(screen.getByLabelText(/Sector/i)).toBeDefined();
    expect(screen.getByLabelText(/Min Amount/i)).toBeDefined();
    expect(screen.getByLabelText(/Jurisdiction/i)).toBeDefined();
    expect(screen.getByLabelText(/Max Nodes/i)).toBeDefined();
    expect(screen.getByLabelText(/Donations/i)).toBeDefined();
    expect(screen.getByLabelText(/Lobbying/i)).toBeDefined();
    expect(screen.getByLabelText(/Votes/i)).toBeDefined();
  });

  it('calls onApply with current filter values on submit', () => {
    const onApply = vi.fn();
    render(<FilterPanel onApply={onApply} onReset={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Sector/i), { target: { value: 'Defense' } });
    fireEvent.change(screen.getByLabelText(/Min Amount/i), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const filters = onApply.mock.calls[0][0];
    expect(filters.sectors).toBe('Defense');
    expect(filters.min_amount).toBe('5000');
    expect(filters.edge_types).toContain('DONATED_TO');
  });

  it('toggles edge types on checkbox click', () => {
    const onApply = vi.fn();
    render(<FilterPanel onApply={onApply} onReset={vi.fn()} />);

    // DONATED_TO is checked by default
    const donations = screen.getByLabelText(/Donations/i) as HTMLInputElement;
    expect(donations.checked).toBe(true);

    // Toggle on Lobbying
    fireEvent.click(screen.getByLabelText(/Lobbying/i));
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

    const filters = onApply.mock.calls[0][0];
    expect(filters.edge_types).toContain('DONATED_TO');
    expect(filters.edge_types).toContain('LOBBIED_FOR');
  });

  it('resets filters and calls onReset', () => {
    const onReset = vi.fn();
    const onApply = vi.fn();
    render(<FilterPanel onApply={onApply} onReset={onReset} />);

    // Change a value
    fireEvent.change(screen.getByLabelText(/Sector/i), { target: { value: 'Tech' } });
    // Reset
    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));

    expect(onReset).toHaveBeenCalledTimes(1);
    // After reset the sector input should be empty
    expect((screen.getByLabelText(/Sector/i) as HTMLInputElement).value).toBe('');
  });

  it('disables submit when loading', () => {
    render(<FilterPanel onApply={vi.fn()} onReset={vi.fn()} loading />);
    expect((screen.getByRole('button', { name: /Loading/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits form on enter key in input', () => {
    const onApply = vi.fn();
    render(<FilterPanel onApply={onApply} onReset={vi.fn()} />);
    fireEvent.submit(screen.getByRole('form'));
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
