import { describe, expect, it } from 'vitest';
import { ALL_SCENARIOS, SimIo, runSimCli, withSuffix } from '../cli';

class FakeSimIo extends SimIo {
  readonly stdout: string[] = [];
  readonly stderr: string[] = [];
  readonly files = new Map<string, string>();
  code: number | null = null;

  override out(text: string): void {
    this.stdout.push(text);
  }
  override err(text: string): void {
    this.stderr.push(text);
  }
  override write(path: string, text: string): void {
    this.files.set(path, text);
  }

  get output(): string {
    return this.stdout.join('\n');
  }
}

function sim(...args: string[]): FakeSimIo {
  const io = new FakeSimIo();
  io.code = runSimCli(args, io, ALL_SCENARIOS);
  return io;
}

describe('npm run sim', () => {
  it('defaults to the curves report', () => {
    const io = sim('--runs', '5', '--bots', 'greedy');
    expect(io.code).toBe(0);
    expect(io.output).toMatch(/seeds 1\.\.5 · bots greedy/);
    expect(io.output).toMatch(/mean margin over target by round/);
    expect(io.output).toMatch(/by archetype\narchetype\s+runs/);
    expect(io.output).not.toMatch(/item impact/);
  });

  it('omits the archetype breakdown when archetypes are just bot names', () => {
    const io = sim('--runs', '5', '--bots', 'hoarder');
    expect(io.output).not.toMatch(/by archetype/);
  });

  it('--report impact prints the impact table only', () => {
    const io = sim('--runs', '10', '--report', 'impact', '--min-samples', '3');
    expect(io.output).toMatch(/item impact/);
    expect(io.output).toMatch(/pooled over 30 runs from bots greedy, hoarder, random; LOW N = fewer than 3 runs/);
    expect(io.output).not.toMatch(/mean margin over target/);
  });

  it('--csv writes one file, or one per report with suffixes for --report all', () => {
    const one = sim('--runs', '3', '--report', 'impact', '--csv', 'out/impact.csv');
    expect([...one.files.keys()]).toEqual(['out/impact.csv']);
    expect(one.files.get('out/impact.csv')).toMatch(/^id,kind,offers,/);
    expect(one.output).toMatch(/wrote out\/impact\.csv/);

    const all = sim('--runs', '3', '--report', 'all', '--csv', 'out/run.csv');
    expect([...all.files.keys()]).toEqual(['out/run-curves.csv', 'out/run-impact.csv']);
    expect(all.files.get('out/run-curves.csv')).toMatch(/^grouping,group,runs,/);
    expect(all.files.get('out/run-curves.csv')).toMatch(/\narchetype,greedy\/(tens|modifiers),/);
  });

  it('is deterministic for the same seeds', () => {
    const args = ['--runs', '8', '--first-seed', '40', '--report', 'all'];
    expect(sim(...args).output).toBe(sim(...args).output);
  });

  it.each([
    [['--report', 'everything'], /--report must be one of curves, impact, all/],
    [['--runs', '0'], /--runs must be an integer ≥ 1/],
    [['--scenario', 'chess'], /unknown scenario "chess"/],
    [['--bots', 'greedy,nobody'], /unknown bot\(s\) nobody/],
    [['--csv'], /--csv needs a value/],
    [['stray'], /unexpected argument "stray"/],
  ])('%j is a usage error', (args, message) => {
    const io = sim(...args);
    expect(io.code).toBe(1);
    expect(io.stderr.join('\n')).toMatch(message);
  });

  it('--help lists scenarios and their bots', () => {
    const io = sim('--help');
    expect(io.output).toMatch(/scenarios: demo \(bots: greedy, hoarder, random\)/);
  });
});

describe('withSuffix', () => {
  it.each([
    ['run.csv', 'run-impact.csv'],
    ['out/run.csv', 'out/run-impact.csv'],
    ['out.d/run', 'out.d/run-impact'],
    ['.hidden', '.hidden-impact'],
  ])('%s → %s', (path, expected) => {
    expect(withSuffix(path, 'impact')).toBe(expected);
  });
});
