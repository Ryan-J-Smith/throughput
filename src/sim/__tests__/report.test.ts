import { describe, expect, it } from 'vitest';
import { demoRun, GreedyBot } from '../demo';
import { aggregate, aggregateBy, curvesCsv, formatReport, toCsv } from '../report';
import { defineScenario } from '../scenarios';
import type { RoundStats, RunStats } from '../simulate';

const round = (n: number, target: number, score: number): RoundStats => ({
  round: n,
  isBoss: false,
  target,
  score,
  margin: (score - target) / target,
  won: score >= target,
  cash: 0,
});

const runStats = (seed: number, rounds: RoundStats[], won: boolean, archetype = 'bot'): RunStats => ({
  seed,
  bot: 'bot',
  archetype,
  won,
  roundReached: rounds.length,
  roundsCleared: won ? rounds.length : rounds.length - 1,
  rounds,
  offers: [],
  purchases: [],
});

describe('aggregate', () => {
  const stats = [
    runStats(1, [round(1, 100, 150), round(2, 200, 300)], true),
    runStats(2, [round(1, 100, 120), round(2, 200, 100)], false),
    runStats(3, [round(1, 100, 50)], false),
  ];

  it('computes win rate and round reached', () => {
    const report = aggregate('bot', stats);
    expect(report.runs).toBe(3);
    expect(report.winRate).toBeCloseTo(1 / 3);
    expect(report.meanRoundReached).toBeCloseTo(5 / 3);
    expect(report.medianRoundReached).toBe(2);
  });

  it('builds a per-round margin curve over the runs that reached each round', () => {
    const [r1, r2] = aggregate('bot', stats).marginCurve;
    expect(r1).toEqual({ round: 1, samples: 3, meanMargin: (0.5 + 0.2 - 0.5) / 3, medianMargin: 0.2, clearRate: 2 / 3 });
    expect(r2?.samples).toBe(2);
    expect(r2?.medianMargin).toBeCloseTo(0);
    expect(r2?.clearRate).toBe(0.5);
  });

  it('handles no runs', () => {
    expect(aggregate('none', [])).toEqual({ group: 'none', runs: 0, winRate: 0, meanRoundReached: 0, medianRoundReached: 0, marginCurve: [] });
  });
});

describe('aggregateBy', () => {
  it('groups runs by key in order of first appearance', () => {
    const stats = [
      runStats(1, [round(1, 100, 150)], true, 'tempo'),
      runStats(2, [round(1, 100, 50)], false, 'snowball'),
      runStats(3, [round(1, 100, 120)], true, 'tempo'),
    ];
    const reports = aggregateBy(stats, (s) => s.archetype);
    expect(reports.map((r) => [r.group, r.runs, r.winRate])).toEqual([
      ['tempo', 2, 1],
      ['snowball', 1, 0],
    ]);
  });
});

describe('formatReport', () => {
  it('labels the group column', () => {
    const text = formatReport([aggregate('tempo', [runStats(1, [round(1, 100, 150)], true)])], 'archetype');
    expect(text).toMatch(/^archetype\s+runs/);
  });

  it('prints a summary row per bot and the curves side by side', () => {
    const a = aggregate('tempo', [runStats(1, [round(1, 100, 150), round(2, 200, 300)], true)]);
    const b = aggregate('snowball', [runStats(1, [round(1, 100, 90)], false)]);
    const text = formatReport([a, b]);
    expect(text).toMatch(/^bot\s+runs\s+win%/);
    expect(text).toMatch(/tempo\s+1\s+100\.0%/);
    expect(text).toMatch(/snowball\s+1\s+0\.0%/);
    expect(text).toMatch(/1\s+\+50% n=1\s+-10% n=1/);
    expect(text).toMatch(/2\s+\+50% n=1\s+-/);
  });
});

describe('defineScenario', () => {
  it('runs the selected bots over the seeds', () => {
    const scenario = defineScenario({ name: 's', description: 'd', runFactory: demoRun, bots: [new GreedyBot()] });
    expect(scenario.botNames).toEqual(['greedy']);
    const [report] = scenario.run([1, 2]);
    expect(report?.runs).toBe(2);
    expect(scenario.run([1], ['nobody'])).toEqual([]);
  });

  it('simulate() returns raw run stats for the selected bots', () => {
    const scenario = defineScenario({ name: 's', description: 'd', runFactory: demoRun, bots: [new GreedyBot()] });
    expect(scenario.simulate([1, 2]).map((s) => [s.seed, s.bot])).toEqual([
      [1, 'greedy'],
      [2, 'greedy'],
    ]);
    expect(scenario.simulate([1], ['nobody'])).toEqual([]);
  });
});

describe('CSV', () => {
  it('escapes commas, quotes and newlines and leaves nulls empty', () => {
    expect(toCsv(['a', 'b', 'c'], [['x,y', 'say "hi"', null], [1, true, 'line\nbreak']])).toBe(
      'a,b,c\n"x,y","say ""hi""",\n1,true,"line\nbreak"\n',
    );
  });

  it('writes one curve row per grouping, group and round', () => {
    const report = aggregate('tempo', [runStats(1, [round(1, 100, 150), round(2, 200, 300)], true)]);
    const lines = curvesCsv([{ grouping: 'bot', reports: [report] }]).trim().split('\n');
    expect(lines[0]).toBe('grouping,group,runs,win_rate,round,samples,mean_margin,median_margin,clear_rate');
    expect(lines.slice(1)).toEqual(['bot,tempo,1,1,1,1,0.5,0.5,1', 'bot,tempo,1,1,2,1,0.5,0.5,1']);
  });
});
