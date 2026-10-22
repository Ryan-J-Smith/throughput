import { describe, expect, it } from 'vitest';
import { defaultBomConfig } from '../content';
import { makePart } from '../model';
import type { Part } from '../model';
import { BomRun } from '../rules';
import type { BomConfig } from '../rules';

// Design doc §2 worked example (Q2 Big, target 600). The doc's round is Q2 Big; here every
// target is 600 so the example plays as round 1 (same numbers, Small-market reward).

const HAND = (): Part[] => [
  makePart('chip', 4),
  makePart('bolt', 3),
  makePart('shell', 3),
  makePart('shell', 2),
  makePart('paint', 2),
  makePart('paint', 1),
  makePart('bolt', 1),
  makePart('chip', 1),
];

function exampleRun(facilities: readonly string[], premiumLevels: number): BomRun {
  const config: BomConfig = {
    ...defaultBomConfig(),
    targets: [
      [600, 600, 600],
      [600, 600, 600],
      [600, 600, 600],
      [600, 600, 600],
    ],
    startingFacilities: facilities,
    startingDeck: HAND,
    startingBench: () => [makePart('motor', 14, { fabricated: true })],
  };
  const run = new BomRun(config, 1);
  const fan = run.blueprint('desk-fan');
  if (fan === undefined) throw new Error('Desk Fan missing');
  fan.premiumLevels = premiumLevels;
  return run;
}

/** Finds a hand (or Bench) part by category and grade. */
function pick(run: BomRun, category: string, grade: number): Part {
  const part = [...run.hand, ...run.bench].find((p) => p.category === category && p.grade === grade);
  if (part === undefined) throw new Error(`no ${category} ${grade}`);
  return part;
}

const DOC_FACILITIES = ['precision-tooling', 'paint-shop', 'lean-line'];

describe('BoM worked example', () => {
  it('Desk Fan with 1 Premium level costs $6', () => {
    expect(exampleRun(DOC_FACILITIES, 1).blueprint('desk-fan')?.price).toBe(6);
  });

  it('Build 1: lean ships 336, loaded ships 440', () => {
    const run = exampleRun(DOC_FACILITIES, 1);
    const motor = pick(run, 'motor', 14);
    const lean = run.quoteOptions([motor, pick(run, 'shell', 3)]);
    expect(lean.map((q) => [q.blueprint.id, q.revenue])).toEqual([['desk-fan', 336]]);
    expect(lean[0]?.score.values()).toEqual({ units: 32, price: 6, demand: 50, markup: 1.75 });

    const loaded = run.quoteOptions([motor, pick(run, 'shell', 3), pick(run, 'paint', 2), pick(run, 'paint', 1)]);
    expect(loaded.map((q) => q.revenue)).toEqual([440]);
    expect(loaded[0]?.score.values()).toEqual({ units: 32, price: 11, demand: 50, markup: 1.25 });
  });

  it('swapping Paint Shop for a second Premium level makes lean win 448 to 440', () => {
    const run = exampleRun(['precision-tooling', 'lean-line'], 2);
    expect(run.blueprint('desk-fan')?.price).toBe(8);
    const motor = pick(run, 'motor', 14);
    const [lean] = run.quoteOptions([motor, pick(run, 'shell', 3)]);
    const [loaded] = run.quoteOptions([motor, pick(run, 'shell', 3), pick(run, 'paint', 2), pick(run, 'paint', 1)]);
    expect(lean?.revenue).toBe(448);
    expect(loaded?.revenue).toBe(440);
  });

  it('plays out: 440, Motor 18, 262, then Overtime', () => {
    const run = exampleRun(DOC_FACILITIES, 1);
    const b1 = run.ship([pick(run, 'motor', 14), pick(run, 'shell', 3), pick(run, 'paint', 2), pick(run, 'paint', 1)], 'desk-fan');
    expect(b1.quote.revenue).toBe(440);
    expect(b1.growth).toBe(0); // 32 Units < 50 Demand: no sell-out
    expect(run.bench).toEqual([]);

    const b2 = run.fabricate([pick(run, 'chip', 4), pick(run, 'bolt', 3)]);
    expect(b2.output).toMatchObject({ category: 'motor', grade: 18, fabricated: true });
    expect(run.revenue).toBe(440);

    const b3 = run.ship([pick(run, 'motor', 18), pick(run, 'shell', 2)], 'desk-fan');
    expect(b3.quote.score.values()).toEqual({ units: 35, price: 6, demand: 25, markup: 1.75 });
    expect(b3.quote.revenue).toBe(262);
    expect(run.revenue).toBe(702);
    expect(run.phase).toBe('overtime');
    expect(run.buildsLeft).toBe(1);
    expect(run.whyCannotShip([pick(run, 'bolt', 1)], 'gizmo')).toMatch(/locked in Overtime/);
  });

  it('Build 4 Overtime: take $1, or Fabricate a Motor (grade 8) for next round', () => {
    const play = (): BomRun => {
      const run = exampleRun(DOC_FACILITIES, 1);
      run.ship([pick(run, 'motor', 14), pick(run, 'shell', 3), pick(run, 'paint', 2), pick(run, 'paint', 1)], 'desk-fan');
      run.fabricate([pick(run, 'chip', 4), pick(run, 'bolt', 3)]);
      run.ship([pick(run, 'motor', 18), pick(run, 'shell', 2)], 'desk-fan');
      return run;
    };

    const cash = play();
    const end = cash.collect();
    expect(end.payout?.lines).toEqual([
      { source: 'Small market cleared', amount: 3 },
      { source: 'Unused Builds ×1', amount: 1 },
    ]);
    expect(cash.wallet.cash).toBe(8);
    expect(cash.phase).toBe('shop');

    const fab = play();
    const result = fab.fabricate([pick(fab, 'chip', 1), pick(fab, 'bolt', 1)]);
    expect(result.output.grade).toBe(8);
    expect(result.roundEnd?.payout?.lines).toEqual([{ source: 'Small market cleared', amount: 3 }]);
    expect(fab.wallet.cash).toBe(7);
    expect(fab.bench.map((p) => [p.category, p.grade])).toEqual([['motor', 8]]);
  });
});
