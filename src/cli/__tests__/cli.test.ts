import { describe, expect, it } from 'vitest';
import { CounterGame } from '../../play/__tests__/counter-game';
import { ALL_GAMES, CliIo, EXIT_ILLEGAL, EXIT_OK, EXIT_USAGE, runCli } from '..';

/** In-memory files and captured output. */
class FakeIo extends CliIo {
  readonly files = new Map<string, string>();
  stdout: string[] = [];
  stderr: string[] = [];

  override exists(path: string): boolean {
    return this.files.has(path);
  }
  override read(path: string): string {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`no file ${path}`);
    return text;
  }
  override write(path: string, text: string): void {
    this.files.set(path, text);
  }
  override out(text: string): void {
    this.stdout.push(text);
  }
  override err(text: string): void {
    this.stderr.push(text);
  }

  run(...args: string[]): number {
    this.stdout = [];
    this.stderr = [];
    return runCli(args, this, ALL_GAMES);
  }

  get output(): string {
    return this.stdout.join('\n');
  }

  actions(path = 'run.json'): string[] {
    return (JSON.parse(this.read(path)) as { actions: string[] }).actions;
  }
}

function started(): FakeIo {
  const io = new FakeIo();
  expect(io.run('new', '--seed', '42', '--save', 'run.json')).toBe(EXIT_OK);
  return io;
}

describe('cli new/state', () => {
  it('new writes a save and prints the state', () => {
    const io = started();
    expect(JSON.parse(io.read('run.json'))).toEqual({ version: 1, game: 'demo', seed: 42, actions: [] });
    expect(io.output).toMatch(/^demo · seed 42 · 0 actions · phase: roundStart/);
    expect(io.output).toMatch(/Legal actions:\n {2}continue — start round 1/);
  });

  it('new refuses to overwrite without --force', () => {
    const io = started();
    io.run('act', '--save', 'run.json', 'continue');
    expect(io.run('new', '--seed', '1', '--save', 'run.json')).toBe(EXIT_USAGE);
    expect(io.stderr.join()).toMatch(/already exists/);
    expect(io.actions()).toEqual(['continue']);
    expect(io.run('new', '--seed', '1', '--save', 'run.json', '--force')).toBe(EXIT_OK);
    expect(io.actions()).toEqual([]);
  });

  it('state replays and prints the same view as the last act', () => {
    const io = started();
    io.run('act', '--save', 'run.json', 'continue');
    const afterAct = io.output.split('\n\n').at(-1);
    expect(io.run('state', '--save', 'run.json')).toBe(EXIT_OK);
    expect(io.output).toBe(afterAct);
  });
});

describe('cli act', () => {
  it('applies a legal action, appends it canonically, and prints the log then the state', () => {
    const io = started();
    expect(io.run('act', '--save', 'run.json', 'continue')).toBe(EXIT_OK);
    expect(io.run('act', '--save', 'run.json', 'PLAY', '1', '2')).toBe(EXIT_OK);
    expect(io.actions()).toEqual(['continue', 'play 1 2']);
    expect(io.output).toMatch(/^> play 1 2\nPlayed: /);
    expect(io.output).toMatch(/Play scored \d+; round \d+\/120/);
    expect(io.output).toMatch(/phase: playing/);
  });

  it('refuses an illegal action: reason on stderr, legal actions on stdout, save untouched', () => {
    const io = started();
    const before = io.read('run.json');
    expect(io.run('act', '--save', 'run.json', 'buy 1')).toBe(EXIT_ILLEGAL);
    expect(io.stderr).toEqual(['illegal action "buy 1": Shop is closed']);
    expect(io.output).toMatch(/^Legal actions:\n {2}continue/);
    expect(io.read('run.json')).toBe(before);
  });

  it('--json prints machine-readable results', () => {
    const io = started();
    expect(io.run('act', '--save', 'run.json', 'continue', '--json')).toBe(EXIT_OK);
    const ok = JSON.parse(io.output) as { ok: boolean; action: string; log: string[]; state: { phase: string; hand: unknown[] } };
    expect(ok).toMatchObject({ ok: true, action: 'continue', state: { phase: 'playing' } });
    expect(ok.state.hand).toHaveLength(8);

    expect(io.run('act', '--save', 'run.json', 'play 9', '--json')).toBe(EXIT_ILLEGAL);
    expect(JSON.parse(io.output)).toMatchObject({ ok: false, action: 'play 9', error: 'No card at hand position 9 (hand has 8)' });

    expect(io.run('state', '--save', 'missing.json', '--json')).toBe(EXIT_USAGE);
    expect(JSON.parse(io.output)).toMatchObject({ ok: false, error: expect.stringMatching(/no save file/) });
  });

  it('replaying the same commands on another save gives the same output', () => {
    const a = started();
    const b = started();
    for (const action of ['continue', 'discard 1 2', 'play 1 2 3']) {
      a.run('act', '--save', 'run.json', action);
      b.run('act', '--save', 'run.json', action);
      expect(a.output).toBe(b.output);
    }
  });
});

describe('cli errors', () => {
  it.each([
    [[], /missing command/],
    [['fly'], /unknown command "fly"/],
    [['new', '--save', 'x.json'], /--seed is required/],
    [['new', '--seed', 'abc', '--save', 'x.json'], /--seed must be an integer/],
    [['new', '--seed', '1', '--save', 'x.json', '--game', 'chess'], /unknown game "chess"/],
    [['state', '--save'], /--save needs a value/],
    [['state', '--save', 'x.json', '--verbose'], /unknown option --verbose/],
    [['act', '--save', 'x.json'], /act needs an action/],
    [['state', '--save', 'x.json'], /no save file at x.json/],
  ])('%j exits with a usage error', (args, message) => {
    const io = new FakeIo();
    expect(io.run(...args)).toBe(EXIT_USAGE);
    expect(io.stderr.join('\n')).toMatch(message);
  });

  it('reports corrupt saves', () => {
    const io = new FakeIo();
    io.write('bad.json', '{"version":1,"game":"demo","seed":1,"actions":["buy 1"]}');
    expect(io.run('state', '--save', 'bad.json')).toBe(EXIT_USAGE);
    expect(io.stderr.join()).toMatch(/Action 1 "buy 1" no longer replays/);
  });

  it('help prints usage', () => {
    const io = new FakeIo();
    expect(io.run('help')).toBe(EXIT_OK);
    expect(io.output).toMatch(/^usage:/);
  });
});

describe('cli rules', () => {
  it('prints a game\'s rules by --game or from a save, without touching the save', () => {
    const io = new FakeIo();
    expect(io.run('rules', '--game', 'throughput')).toBe(EXIT_OK);
    expect(io.output).toMatch(/^THROUGHPUT — rules\n/);
    io.run('new', '--seed', '5', '--save', 't.json', '--game', 'throughput');
    const saved = io.read('t.json');
    expect(io.run('rules', '--save', 't.json')).toBe(EXIT_OK);
    expect(io.output).toMatch(/^THROUGHPUT — rules\n/);
    expect(io.read('t.json')).toBe(saved);
  });

  it('needs a game, and says so for a game without rules text', () => {
    const io = new FakeIo();
    expect(io.run('rules')).toBe(EXIT_USAGE);
    expect(io.stderr.join('\n')).toMatch(/rules needs --game NAME or --save FILE \(games: demo, bom, throughput\)/);
    expect(io.run('rules', '--game', 'demo')).toBe(EXIT_USAGE);
    expect(io.stderr.join('\n')).toMatch(/demo has no rules text/);
  });
});

describe('cli with a non-Run game', () => {
  it('drives any TextGame and does not rewrite the save for read-only queries', () => {
    const io = new FakeIo();
    const games = [...ALL_GAMES, new CounterGame()];
    expect(runCli(['new', '--seed', '3', '--save', 'c.json', '--game', 'counter'], io, games)).toBe(EXIT_OK);
    expect(runCli(['act', '--save', 'c.json', 'add', '4'], io, games)).toBe(EXIT_OK);
    const saved = io.read('c.json');
    io.stdout = [];
    expect(runCli(['act', '--save', 'c.json', 'peek', '--json'], io, games)).toBe(EXIT_OK);
    expect(JSON.parse(io.stdout.join(''))).toEqual({ ok: true, action: 'peek', recorded: false, log: ['value is 7'], state: { value: 7 } });
    expect(io.read('c.json')).toBe(saved);
  });

  it('prints only the log for read-only queries in text mode', () => {
    const io = new FakeIo();
    const games = [...ALL_GAMES, new CounterGame()];
    runCli(['new', '--seed', '3', '--save', 'c.json', '--game', 'counter'], io, games);
    io.stdout = [];
    expect(runCli(['act', '--save', 'c.json', 'peek'], io, games)).toBe(EXIT_OK);
    expect(io.stdout.join('\n')).toBe('> peek\nvalue is 3\n(state unchanged; use "state" to reprint it)');
  });
});
