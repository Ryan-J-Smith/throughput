import { describe, expect, it } from 'vitest';
import { computeImpact } from '../impact';
import { Scenario } from '../scenarios';
import { RunRecorder } from '../simulate';
import type { RunStats } from '../simulate';

/** A non-Run game: each "run" clears seed % 4 rounds and buys "widget" in odd seeds. */
class CoinScenario extends Scenario {
  readonly name = 'coin';
  readonly description = 'fake custom engine';
  readonly botNames = ['flip'];

  override simulate(seeds: readonly number[], botNames?: readonly string[]): RunStats[] {
    if (botNames !== undefined && !botNames.includes('flip')) return [];
    return seeds.map((seed) => {
      const recorder = new RunRecorder(seed, 'flip');
      const cleared = seed % 4;
      for (let round = 1; round <= cleared + 1 && round <= 3; round++) {
        const won = round <= cleared;
        recorder.round({ round, isBoss: false, target: 100, score: won ? 150 : 50, won, cash: round });
        if (won && round < 3) {
          recorder.offer({ round, id: 'widget', kind: 'facility', price: 4 });
          if (seed % 2 === 1) recorder.purchase({ round, id: 'widget', kind: 'facility', price: 4 });
        }
      }
      return recorder.finish({ won: cleared >= 3, roundReached: Math.min(cleared + 1, 3), archetype: seed % 2 ? 'buyer' : 'saver' });
    });
  }
}

describe('custom Scenario + RunRecorder', () => {
  const scenario = new CoinScenario();
  const stats = scenario.simulate([1, 2, 3, 4, 5, 6, 7, 8]);

  it('produces RunStats with derived margins and rounds cleared', () => {
    const run3 = stats.find((s) => s.seed === 3);
    expect(run3).toMatchObject({ bot: 'flip', archetype: 'buyer', won: true, roundReached: 3, roundsCleared: 3 });
    expect(run3?.rounds.map((r) => r.margin)).toEqual([0.5, 0.5, 0.5]);
    const run2 = stats.find((s) => s.seed === 2);
    expect(run2).toMatchObject({ won: false, roundReached: 3, roundsCleared: 2 });
  });

  it('feeds the shared reports', () => {
    expect(scenario.run([1, 2, 3, 4]).map((r) => [r.group, r.runs])).toEqual([['flip', 4]]);
    const [widget] = computeImpact(stats, { minSamples: 1 });
    expect(widget).toMatchObject({ id: 'widget', kind: 'facility', runsBought: 4, runsSkipped: 2 }); // odd seeds buy; 4 and 8 never see it
  });
});
