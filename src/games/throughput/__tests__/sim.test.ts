import { describe, expect, it } from 'vitest';
import { ThroughputScenario, throughputBots } from '../sim';

describe('ThroughputScenario', () => {
  const scenario = new ThroughputScenario();
  const seeds = [1, 2, 3, 4, 5];

  it('every bot plays whole runs legally and each run records its rounds, offers and result', () => {
    const stats = scenario.simulate(seeds);
    expect(scenario.botNames).toEqual(throughputBots().map((b) => b.name));
    expect(stats).toHaveLength(seeds.length * scenario.botNames.length);
    for (const run of stats) {
      expect(run.rounds).toHaveLength(run.roundReached);
      expect(run.rounds.at(-1)?.won).toBe(run.won);
      expect(run.roundsCleared).toBe(run.rounds.filter((r) => r.won).length);
      if (run.roundsCleared > 0 && !(run.won && run.roundReached === 1)) expect(run.offers.length).toBeGreaterThan(0);
      for (const purchase of run.purchases) expect(run.offers.some((o) => o.id === purchase.id && o.round === purchase.round)).toBe(true);
    }
  });

  it('is deterministic per seed and filters by bot name', () => {
    expect(scenario.simulate(seeds, ['mass-market'])).toEqual(scenario.simulate(seeds, ['mass-market']));
    expect(new Set(scenario.simulate([1], ['greedy', 'trend-surfer']).map((s) => s.bot))).toEqual(new Set(['greedy', 'trend-surfer']));
  });
});
