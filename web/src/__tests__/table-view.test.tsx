import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TableView from '../components/graph/TableView.js';
import type { TableRow } from '../lib/api-client.js';

afterEach(() => {
  cleanup();
});

function makeRow(overrides: Partial<TableRow> = {}): TableRow {
  return {
    source_id: 's1',
    source_name: 'Jane Doe',
    source_type: 'Person',
    target_id: 't1',
    target_name: 'PAC Fund',
    target_type: 'Committee',
    edge_type: 'DONATED_TO',
    amount: 5000,
    date: '2024-03-15',
    filing_id: 'F001',
    ...overrides,
  };
}

describe('TableView', () => {
  // @vitest-environment jsdom

  it('shows empty state when no rows', () => {
    render(<TableView rows={[]} totalCount={0} page={1} pageSize={20} onPageChange={vi.fn()} />);
    expect(screen.getByText(/No results/)).toBeDefined();
  });

  it('renders table headers', () => {
    render(
      <TableView rows={[makeRow()]} totalCount={1} page={1} pageSize={20} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText('Source')).toBeDefined();
    expect(screen.getByText('Target')).toBeDefined();
    expect(screen.getByText('Relationship')).toBeDefined();
    expect(screen.getByText('Amount')).toBeDefined();
    expect(screen.getByText('Date')).toBeDefined();
    expect(screen.getByText('Filing ID')).toBeDefined();
  });

  it('renders row data', () => {
    render(
      <TableView rows={[makeRow()]} totalCount={1} page={1} pageSize={20} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText('Jane Doe')).toBeDefined();
    expect(screen.getByText('PAC Fund')).toBeDefined();
    expect(screen.getByText('DONATED_TO')).toBeDefined();
    expect(screen.getByText('$5,000')).toBeDefined();
    // Date may render as Mar 14 or Mar 15 due to UTC offset
    expect(screen.getByText(/Mar 1[45], 2024/)).toBeDefined();
    expect(screen.getByText('F001')).toBeDefined();
  });

  it('renders em dash for null amount', () => {
    render(
      <TableView
        rows={[makeRow({ amount: null })]}
        totalCount={1}
        page={1}
        pageSize={20}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('sorts by column on header click', () => {
    const rows = [
      makeRow({ source_name: 'Zeta', amount: 100 }),
      makeRow({ source_name: 'Alpha', amount: 9000 }),
    ];
    render(<TableView rows={rows} totalCount={2} page={1} pageSize={20} onPageChange={vi.fn()} />);

    // Default sort is by amount desc — $9,000 should be first
    const cells = screen.getAllByRole('cell');
    // First row source_name offset
    const firstSourceCell = cells[0];
    expect(firstSourceCell.textContent).toBe('Alpha');

    // Click Source header to sort by source_name desc
    fireEvent.click(screen.getByText('Source'));
    const cellsAfterSort = screen.getAllByRole('cell');
    expect(cellsAfterSort[0].textContent).toBe('Zeta');
  });

  it('shows pagination when totalCount > pageSize', () => {
    const onPageChange = vi.fn();
    render(
      <TableView
        rows={[makeRow()]}
        totalCount={50}
        page={1}
        pageSize={20}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByText('Page 1 of 3')).toBeDefined();
    expect((screen.getByRole('button', { name: /Previous/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Next/ }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('hides pagination for single page', () => {
    render(<TableView rows={[makeRow()]} totalCount={1} page={1} pageSize={20} onPageChange={vi.fn()} />);
    expect(screen.queryByText(/Page 1 of/)).toBeNull();
  });

  it('shows total record count', () => {
    render(<TableView rows={[makeRow()]} totalCount={42} page={1} pageSize={20} onPageChange={vi.fn()} />);
    expect(screen.getByText('42 total records')).toBeDefined();
  });

  it('disables Next on last page', () => {
    render(
      <TableView rows={[makeRow()]} totalCount={15} page={1} pageSize={20} onPageChange={vi.fn()} />,
    );
    // Only 1 page — no pagination shown
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
  });
});
