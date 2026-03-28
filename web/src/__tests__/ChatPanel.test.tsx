// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ChatPanel, { type ChatMessage } from '../components/ai/ChatPanel';

// Mock @mlc-ai/web-llm to prevent ESM import issues
vi.mock('@mlc-ai/web-llm', () => ({
  MLCEngine: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe('ChatPanel', () => {
  const noop = async () => {};

  it('renders empty state prompt', () => {
    render(<ChatPanel onSubmit={noop} messages={[]} />);
    expect(screen.getByText(/Ask a question/)).toBeTruthy();
  });

  it('renders user and assistant messages', () => {
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Who donated?', timestamp: '2025-01-01T00:00:00Z' },
      { id: '2', role: 'assistant', content: '$50,000 was donated.', timestamp: '2025-01-01T00:01:00Z' },
    ];
    render(<ChatPanel onSubmit={noop} messages={messages} />);
    expect(screen.getByText('Who donated?')).toBeTruthy();
    expect(screen.getByText('$50,000 was donated.')).toBeTruthy();
  });

  it('disables input when disabled prop is true', () => {
    render(<ChatPanel onSubmit={noop} messages={[]} disabled />);
    const input = screen.getByLabelText('Query input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('shows model status when not ready', () => {
    render(<ChatPanel onSubmit={noop} messages={[]} modelStatus="loading" modelProgress={0.5} />);
    expect(screen.getByTestId('model-status')).toBeTruthy();
    expect(screen.getByText(/Loading model/)).toBeTruthy();
  });

  it('shows streaming content', () => {
    render(
      <ChatPanel onSubmit={noop} messages={[]} streaming streamContent="Analyzing data..." />,
    );
    expect(screen.getByTestId('streaming')).toBeTruthy();
    expect(screen.getByText('Analyzing data...')).toBeTruthy();
  });

  it('calls onSubmit when form is submitted with non-empty input', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ChatPanel onSubmit={onSubmit} messages={[]} />);
    const input = screen.getByLabelText('Query input');
    fireEvent.change(input, { target: { value: 'Top donors?' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('Top donors?');
  });

  it('does not submit empty input', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ChatPanel onSubmit={onSubmit} messages={[]} />);
    fireEvent.submit(screen.getByLabelText('Query input').closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows cypher viewer toggle when lastCypher is set', () => {
    render(
      <ChatPanel
        onSubmit={noop}
        messages={[]}
        lastCypher="MATCH (n:Person) RETURN n LIMIT 10"
      />,
    );
    const toggle = screen.getByText(/Show.*Generated Query/);
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByTestId('cypher-viewer')).toBeTruthy();
  });

  it('shows loading state text', () => {
    render(<ChatPanel onSubmit={noop} messages={[]} loading />);
    expect(screen.getByText('Thinking…')).toBeTruthy();
  });
});
