import { describe, expect, it } from 'vitest';
import { demoRun, GreedyBot } from '../demo';
import { aggregate, formatReport } from '../report';
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

const runStats = (seed: number, rounds: RoundStats[], won: boolean): RunStats => ({
  seed,
  won,
  roundReached: rounds.length,
  rounds,
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
    expect(aggregate('none', [])).toEqual({ bot: 'none', runs: 0, winRate: 0, meanRoundReached: 0, medianRoundReached: 0, marginCurve: [] });
  });
});

describe('formatReport', () => {
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
});
