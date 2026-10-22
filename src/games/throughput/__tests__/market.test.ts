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
      // Either Neutral Category (including the one just leaving Saturated) can become Emerging.
      const neutralPool = [...holder(now, 'neutral'), ...holder(now, 'saturated')].sort();
      expect([...holder(next, 'emerging'), ...holder(next, 'neutral')].sort()).toEqual(neutralPool);
    });
  });

  it('lets a trend come straight back: the Category leaving Saturated sometimes re-emerges', () => {
    let comebacks = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const schedule = trendSchedule(12, new Rng(seed));
      schedule.slice(1).forEach((next, i) => {
        if (holder(next, 'emerging')[0] === holder(schedule[i] as Trends, 'saturated')[0]) comebacks++;
      });
    }
    expect(comebacks).toBeGreaterThan(0);
  });

  it('is deterministic per seed', () => {
    expect(trendSchedule(12, new Rng(7))).toEqual(trendSchedule(12, new Rng(7)));
  });
});
