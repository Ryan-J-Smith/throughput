import { describe, expect, it } from 'vitest';
import type { Run } from '../../engine/run';
import { Bot } from '../bots';
import type { PlayDecision, ShopDecision } from '../bots';
import { GreedyBot, demoRun } from '../demo';
import type { DemoCard } from '../demo';
import { SimulationError, simulate } from '../simulate';

/** Discards once per round if it can, then plays its first card; never shops. */
class DiscardThenPlayBot extends Bot<DemoCard> {
  readonly name = 'discard-then-play';
  override playTurn(run: Run<DemoCard>): PlayDecision<DemoCard> {
    const first = run.deck.hand.slice(0, 1);
    return run.discardsLeft === run.config.discardsPerRound ? { action: 'discard', cards: first } : { action: 'play', cards: first };
  }
  override shopTurn(): ShopDecision<DemoCard> {
    return { action: 'leave' };
  }
}

/** Plays its five highest cards; rerolls once per shop visit when affordable, then leaves. */
class RerollOnceBot extends Bot<DemoCard> {
  readonly name = 'reroll-once';
  private readonly rerolledAt = new Set<number>();
  override playTurn(run: Run<DemoCard>): PlayDecision<DemoCard> {
    return { action: 'play', cards: [...run.deck.hand].sort((a, b) => b.value - a.value).slice(0, 5) };
  }
  override shopTurn(run: Run<DemoCard>): ShopDecision<DemoCard> {
    if (this.rerolledAt.has(run.round.number) || run.whyCannotReroll() !== null) return { action: 'leave' };
    this.rerolledAt.add(run.round.number);
    return { action: 'reroll' };
  }
}

/** Plays a card that is not in hand. */
class CheatingBot extends Bot<DemoCard> {
  readonly name = 'cheater';
  override playTurn(): PlayDecision<DemoCard> {
    return { action: 'play', cards: [{ value: 99 }] };
  }
  override shopTurn(): ShopDecision<DemoCard> {
    return { action: 'leave' };
  }
}

describe('simulate', () => {
  const seeds = [1, 2, 3, 4, 5, 6];

  it('is deterministic for the same seeds', () => {
    expect(simulate(demoRun, new GreedyBot(), seeds)).toEqual(simulate(demoRun, new GreedyBot(), seeds));
  });

  it('records one entry per round played and consistent outcomes', () => {
    const stats = simulate(demoRun, new GreedyBot(), seeds);
    expect(stats.map((s) => s.seed)).toEqual(seeds);
    for (const run of stats) {
      expect(run.rounds.map((r) => r.round)).toEqual(Array.from({ length: run.roundReached }, (_, i) => i + 1));
      expect(run.rounds.slice(0, -1).every((r) => r.won)).toBe(true);
      expect(run.rounds.at(-1)?.won).toBe(run.won);
      for (const r of run.rounds) expect(r.margin).toBeCloseTo((r.score - r.target) / r.target);
      for (const p of run.purchases) expect(p.round).toBeLessThan(run.roundReached);
    }
    expect(stats.some((s) => s.purchases.length > 0)).toBe(true);
  });

  it('flags boss rounds and tracks cash', () => {
    const [run] = simulate(demoRun, new GreedyBot(), [1]);
    expect(run?.rounds.map((r) => r.isBoss).slice(0, 4)).toEqual([false, false, false, true]);
    expect(run?.rounds[0]?.cash).toBeGreaterThan(4);
  });

  it('wraps illegal bot decisions in a SimulationError carrying the seed', () => {
    const attempt = () => simulate(demoRun, new CheatingBot(), [42]);
    expect(attempt).toThrow(SimulationError);
    expect(attempt).toThrow(/seed 42: cheater: Selected cards are not in hand/);
  });

  it('guards against bots that take too many actions', () => {
    expect(() => simulate(demoRun, new DiscardThenPlayBot(), [1], { maxActionsPerPhase: 1 })).toThrow(/exceeded 1 round actions/);
    expect(() => simulate(demoRun, new DiscardThenPlayBot(), [1], { maxActionsPerPhase: 50 })).not.toThrow();
  });

  it('records every offer shown, the bot, the archetype and rounds cleared', () => {
    const stats = simulate(demoRun, new GreedyBot(), [1, 2, 3]);
    for (const run of stats) {
      expect(run.bot).toBe('greedy');
      expect(['greedy/tens', 'greedy/modifiers']).toContain(run.archetype);
      expect(run.roundsCleared).toBe(run.won ? run.roundReached : run.roundReached - 1);
      // Greedy never rerolls, so each shop visit shows at most the two restocked slots
      // (fewer once owned modifiers are filtered out of the pool).
      const shopRounds = [...new Set(run.offers.map((o) => o.round))];
      expect(shopRounds).toEqual(Array.from({ length: run.roundsCleared - (run.won ? 1 : 0) }, (_, i) => i + 1));
      for (const r of shopRounds) expect(run.offers.filter((o) => o.round === r).length).toBeLessThanOrEqual(2);
      for (const p of run.purchases) {
        expect(run.offers.some((o) => o.round === p.round && o.id === p.id)).toBe(true);
      }
    }
  });

  it('records offers again after each reroll', () => {
    const [run] = simulate(demoRun, new RerollOnceBot(), [1]);
    expect(run?.offers.filter((o) => o.round === 1)).toHaveLength(4);
  });

  it('uses the bot name as the default archetype', () => {
    const [run] = simulate(demoRun, new RerollOnceBot(), [1]);
    expect(run?.archetype).toBe('reroll-once');
  });
});
