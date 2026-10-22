import { describe, expect, it } from 'vitest';
import { Rng } from '../../../engine/rng';
import { CATEGORIES } from '../model';
import type { Category, TrendStage } from '../model';
import { trendSchedule } from '../rules';
import type { Trends } from '../rules';

function holder(trends: Trends, stage: TrendStage): Category[] {
  return CATEGORIES.filter((c) => trends[c] === stage);
}

describe('trend conveyor', () => {
  it.each([1, 2, 3, 42])('seed %i: one Category per stage, shifting Emerging → Hot → Saturated → Neutral', (seed) => {
    const schedule = trendSchedule(12, new Rng(seed));
    expect(schedule).toHaveLength(12);
    schedule.forEach((now, i) => {
      for (const stage of ['emerging', 'hot', 'saturated', 'neutral'] as const) expect(holder(now, stage)).toHaveLength(1);
      const next = schedule[i + 1];
      if (next === undefined) return;
      expect(holder(next, 'hot')).toEqual(holder(now, 'emerging'));
      expect(holder(next, 'saturated')).toEqual(holder(now, 'hot'));
      expect(holder(next, 'neutral')).toEqual(holder(now, 'saturated'));
      expect(holder(next, 'emerging')).not.toEqual(holder(now, 'saturated'));
    });
  });

  it('is deterministic per seed', () => {
    expect(trendSchedule(12, new Rng(7))).toEqual(trendSchedule(12, new Rng(7)));
  });
});
