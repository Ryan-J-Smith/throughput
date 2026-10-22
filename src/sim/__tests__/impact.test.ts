import { describe, expect, it } from 'vitest';
import { computeImpact } from '../impact';
import type { ItemImpact } from '../impact';
import { formatImpact, impactCsv } from '../report';
import type { RunStats } from '../simulate';

type Spec = {
  readonly won: boolean;
  readonly cleared: number;
  readonly offered: readonly [number, string][];
  readonly bought?: readonly [number, string][];
};

let nextSeed = 1;
function run({ won, cleared, offered, bought = [] }: Spec): RunStats {
  return {
    seed: nextSeed++,
    bot: 'bot',
    archetype: 'bot',
    won,
    roundReached: won ? cleared : cleared + 1,
    roundsCleared: cleared,
    rounds: [],
    offers: offered.map(([round, id]) => ({ round, id, kind: 'modifier', price: 4 })),
    purchases: bought.map(([round, id]) => ({ round, id, kind: 'modifier', price: 4 })),
  };
}

/** `count` runs offered `id` at `round`; the first `wins` win (clearing 8 rounds), the rest clear `round + 1`. */
function cohort(count: number, wins: number, round: number, id: string, bought: boolean): RunStats[] {
  return Array.from({ length: count }, (_, i) =>
    run({
      won: i < wins,
      cleared: i < wins ? 8 : round + 1,
      offered: [[round, id]],
      bought: bought ? [[round, id]] : [],
    }),
  );
}

const find = (items: readonly ItemImpact[], id: string): ItemImpact => {
  const item = items.find((i) => i.id === id);
  if (item === undefined) throw new Error(`no item ${id}`);
  return item;
};

describe('computeImpact', () => {
  it('sees through survivorship: a late item with no real effect has a large naive Δ but zero aware Δ', () => {
    // Round 1 offers reach weak runs (20% win); round 5 offers reach strong runs (80% win).
    // Within each round, buyers and skippers win equally often; late runs simply buy more.
    const stats = [
      ...cohort(5, 1, 1, 'late', true),
      ...cohort(45, 9, 1, 'late', false),
      ...cohort(45, 36, 5, 'late', true),
      ...cohort(5, 4, 5, 'late', false),
    ];
    const late = find(computeImpact(stats), 'late');
    expect(late.winRateBought).toBeCloseTo(37 / 50);
    expect(late.winRateSkipped).toBeCloseTo(13 / 50);
    expect(late.naiveWinDelta).toBeCloseTo(0.48);
    expect(late.awareWinDelta).toBeCloseTo(0);
    expect(late.awareSurvivalDelta).toBeCloseTo(0);
    expect(late.strata).toEqual([
      { round: 1, bought: 5, skipped: 45, winRateBought: 0.2, winRateSkipped: 0.2 },
      { round: 5, bought: 45, skipped: 5, winRateBought: 0.8, winRateSkipped: 0.8 },
    ]);
  });

  it('weights each round by nb·ns/(nb+ns) when an item really helps', () => {
    const stats = [
      ...cohort(10, 6, 1, 'good', true), // 60%
      ...cohort(10, 2, 1, 'good', false), // 20%  → Δ 0.4, w = 5
      ...cohort(4, 2, 2, 'good', true), // 50%
      ...cohort(12, 4, 2, 'good', false), // 33%  → Δ 1/6, w = 3
    ];
    const good = find(computeImpact(stats), 'good');
    expect(good.awareWeight).toBeCloseTo(8);
    expect(good.awareWinDelta).toBeCloseTo((5 * 0.4 + 3 * (0.5 - 4 / 12)) / 8);
    expect(good.awareSurvivalDelta).toBeGreaterThan(0);
  });

  it('counts skip-then-buy as both decisions and ignores offers after the first purchase', () => {
    const stats = [
      run({ won: true, cleared: 8, offered: [[1, 'x'], [2, 'x'], [3, 'x']], bought: [[2, 'x']] }),
      run({ won: false, cleared: 3, offered: [[1, 'x'], [2, 'x']] }),
    ];
    const x = find(computeImpact(stats), 'x');
    expect(x.strata.map((s) => [s.round, s.bought, s.skipped])).toEqual([
      [1, 0, 2],
      [2, 1, 1],
    ]);
    expect(x.awareWinDelta).toBe(1); // only round 2 has both sides
    expect(x.runsBought).toBe(1);
    expect(x.runsSkipped).toBe(1);
    expect(x.meanPurchaseRound).toBe(2);
    expect(x.meanRoundsAfterPurchase).toBe(6);
  });

  it('reports offers, purchases, pick rate and run counts', () => {
    const stats = [
      run({ won: true, cleared: 8, offered: [[1, 'a'], [1, 'a'], [2, 'b']], bought: [[1, 'a']] }),
      run({ won: false, cleared: 2, offered: [[1, 'a']] }),
    ];
    const a = find(computeImpact(stats), 'a');
    expect(a).toMatchObject({ offers: 3, purchases: 1, runsOffered: 2, runsBought: 1, runsSkipped: 1 });
    expect(a.pickRate).toBeCloseTo(1 / 3);
    expect(a.naiveWinDelta).toBe(1);
    const b = find(computeImpact(stats), 'b');
    expect(b).toMatchObject({ runsBought: 0, winRateBought: null, naiveWinDelta: null, awareWinDelta: null, meanPurchaseRound: null });
  });

  it('flags low samples and sorts by aware Δ with unknowns last', () => {
    const stats = [
      ...cohort(30, 20, 1, 'strong', true),
      ...cohort(30, 10, 1, 'strong', false),
      ...cohort(3, 1, 1, 'rare', true),
      ...cohort(3, 2, 1, 'rare', false),
      ...cohort(5, 1, 1, 'never-bought', false),
    ];
    const items = computeImpact(stats, { minSamples: 20 });
    expect(items.map((i) => i.id)).toEqual(['strong', 'rare', 'never-bought']);
    expect(items.map((i) => i.lowSample)).toEqual([false, true, true]);
    expect(computeImpact(stats, { minSamples: 3 }).find((i) => i.id === 'rare')?.lowSample).toBe(false);
  });
});

describe('impact output', () => {
  const items = computeImpact([...cohort(4, 3, 1, 'amp', true), ...cohort(4, 1, 1, 'amp', false)], { minSamples: 20 });

  it('prints a compact table with the low-sample flag', () => {
    const text = formatImpact(items);
    expect(text).toMatch(/^item impact/);
    expect(text).toMatch(/amp\s+modifier\s+8\s+50\.0%\s+4\s+75\.0%\s+4\s+25\.0%\s+\+50%\s+\+50%/);
    expect(text).toMatch(/LOW N/);
  });

  it('writes CSV with one row per item', () => {
    const [header, row] = impactCsv(items).trim().split('\n');
    expect(header?.split(',')).toContain('aware_win_delta');
    expect(row).toMatch(/^amp,modifier,8,4,0\.5,8,4,4,0\.75,0\.25,0\.5,0\.5,/);
    expect(row).toMatch(/,true$/);
  });
});
