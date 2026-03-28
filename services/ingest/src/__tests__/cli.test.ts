import { describe, it, expect } from 'vitest';
import { parseCliArgs, type CliOptions } from '../cli.js';

describe('parseCliArgs', () => {
  function args(...parts: string[]): string[] {
    return ['node', 'cli.ts', ...parts];
  }

  it('should parse the "download" command with defaults', () => {
    const opts = parseCliArgs(args('download'));
    expect(opts.command).toBe('download');
    expect(opts.cycle).toBe('2024');
    expect(opts.dataDir).toBe('./data');
  });

  it('should parse --cycle flag', () => {
    const opts = parseCliArgs(args('run', '--cycle', '2022'));
    expect(opts.command).toBe('run');
    expect(opts.cycle).toBe('2022');
  });

  it('should parse --data-dir flag', () => {
    const opts = parseCliArgs(args('parse', '--data-dir', '/tmp/fec'));
    expect(opts.command).toBe('parse');
    expect(opts.dataDir).toBe('/tmp/fec');
  });

  it('should parse --db-url flag', () => {
    const opts = parseCliArgs(args('load', '--db-url', 'postgresql://user:pass@host:5432/db'));
    expect(opts.command).toBe('load');
    expect(opts.dbUrl).toBe('postgresql://user:pass@host:5432/db');
  });

  it('should parse --opensearch-url flag', () => {
    const opts = parseCliArgs(args('index', '--opensearch-url', 'https://search:9200'));
    expect(opts.command).toBe('index');
    expect(opts.opensearchUrl).toBe('https://search:9200');
  });

  it('should default to "help" when no command is given', () => {
    const opts = parseCliArgs(args());
    expect(opts.command).toBe('help');
  });

  it('should parse all flags together', () => {
    const opts = parseCliArgs(args(
      'run',
      '--cycle', '2020',
      '--data-dir', '/data/fec',
      '--db-url', 'postgresql://a:b@c:5432/d',
      '--opensearch-url', 'https://os:9200',
    ));
    expect(opts.command).toBe('run');
    expect(opts.cycle).toBe('2020');
    expect(opts.dataDir).toBe('/data/fec');
    expect(opts.dbUrl).toBe('postgresql://a:b@c:5432/d');
    expect(opts.opensearchUrl).toBe('https://os:9200');
  });
});
