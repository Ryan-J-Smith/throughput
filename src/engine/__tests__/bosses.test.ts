import { describe, expect, it } from 'vitest';
import { BossRule } from '../bosses';
import type { BossDef } from '../bosses';
import type { EngineEvent } from '../modifiers';
import { Registry } from '../registry';
import type { RoundRules, Run } from '../run';
import { RARITIES, RecordingModifier, makeRun } from './fakes';
import type { TestCard } from './fakes';

/** One fewer play, one smaller hand, double target. */
class SqueezeBoss extends BossRule<TestCard> {
  constructor() {
    super({ id: 'squeeze', name: 'The Squeeze', description: 'Fewer plays, smaller hand, double target' });
  }

  override adjustRoundConfig(rules: RoundRules): RoundRules {
    return { ...rules, plays: rules.plays - 1, handSize: rules.handSize - 1, target: rules.target * 2 };
  }
}

/** No-op boss identified only by its id. */
class NamedBoss extends BossRule<TestCard> {
  constructor(id: string) {
    super({ id, name: id, description: id });
  }
}

/** Halves the multiplier of every play and records the events it sees. */
class HalverBoss extends BossRule<TestCard> {
  readonly seen: string[];

  constructor(seen: string[]) {
    super({ id: 'halver', name: 'The Halver', description: 'Multiplier halved' });
    this.seen = seen;
  }

  override onEvent(event: EngineEvent<TestCard>): void {
    this.seen.push(`boss:${event.type}`);
    if (event.type === 'beforeScore') event.score.multiply('multiplier', 0.5, this.name);
  }
}

function pool(...defs: BossDef<TestCard>[]): Registry<BossDef<TestCard>> {
  const registry = new Registry<BossDef<TestCard>>(RARITIES);
  for (const def of defs) registry.register(def);
  return registry;
}

const def = (id: string, create: () => BossRule<TestCard>): BossDef<TestCard> => ({
  kind: 'boss',
  id,
  name: id,
  description: id,
  rarity: 'common',
  price: 0,
  create,
});

/** Clears round 1 and walks to the start of round 2 (the boss round with bossEvery 2). */
function toBossRound(run: Run<TestCard>): Run<TestCard> {
  run.start();
  run.startRound();
  run.play(run.deck.hand.slice(0, 3));
  run.enterShop();
  run.leaveShop();
  return run;
}

describe('Boss rules', () => {
  it('only boss rounds get a boss', () => {
    const run = makeRun({ rounds: 4, bossEvery: 2, bossPool: pool(def('squeeze', () => new SqueezeBoss())) });
    expect(run.boss).toBeNull();
    toBossRound(run);
    expect(run.round.isBoss).toBe(true);
    expect(run.boss?.id).toBe('squeeze');
  });

  it('adjusts the round rules, and the hand size returns afterwards', () => {
    const run = toBossRound(
      makeRun({ rounds: 4, bossEvery: 2, target: () => 10, bossPool: pool(def('squeeze', () => new SqueezeBoss())) }),
    );
    expect(run.roundRules).toEqual({ target: 20, plays: 1, discards: 1, handSize: 3 });
    expect(run.round.target).toBe(20);
    run.startRound();
    expect(run.playsLeft).toBe(1);
    expect(run.deck.hand).toHaveLength(3);
    run.play(run.deck.hand.slice(0, 3));
    expect(run.phase).toBe('lost'); // 15 < 20 with one play
    expect(run.deck.handSize).toBe(4);
  });

  it('keeps permanent hand size changes made during the boss round', () => {
    const run = toBossRound(
      makeRun({ rounds: 4, bossEvery: 2, target: () => 1, bossPool: pool(def('squeeze', () => new SqueezeBoss())) }),
    );
    run.startRound();
    run.deck.handSize += 2; // e.g. a modifier granting +2 hand size mid-round
    run.play(run.deck.hand.slice(0, 1));
    expect(run.deck.handSize).toBe(6);
  });

  it('sees events only during its round, before modifiers', () => {
    const log: string[] = [];
    const run = makeRun({ rounds: 4, bossEvery: 2, target: () => 1, bossPool: pool(def('halver', () => new HalverBoss(log))) });
    run.modifiers.add(new RecordingModifier('mod', log));
    toBossRound(run);
    expect(log.some((e) => e.startsWith('boss:'))).toBe(false);
    log.length = 0;
    run.startRound();
    const result = run.play(run.deck.hand.slice(0, 2));
    expect(result.total).toBe(5); // 10 base × 0.5
    expect(log.slice(0, 4)).toEqual(['boss:roundStart', 'mod:roundStart', 'boss:beforeScore', 'mod:beforeScore']);
    expect(log.at(-2)).toBe('boss:roundEnd');
    run.enterShop();
    expect(log.at(-1)).toBe('mod:shopEnter');
  });

  it('picks bosses deterministically per seed', () => {
    const bossIds = (seed: number): (string | undefined)[] => {
      const p = pool(...['a', 'b', 'c', 'd'].map((id) => def(id, () => new NamedBoss(id))));
      const run = makeRun({ rounds: 9, bossEvery: 1, target: () => 1, bossPool: p }, seed);
      const ids = [run.boss?.id];
      run.start();
      for (let i = 0; i < 5; i++) {
        run.startRound();
        run.play(run.deck.hand.slice(0, 1));
        run.enterShop();
        run.leaveShop();
        ids.push(run.boss?.id);
      }
      return ids;
    };
    expect(bossIds(7)).toEqual(bossIds(7));
    expect(new Set(bossIds(7)).size).toBeGreaterThan(1);
  });

  it('without a pool, boss rounds are only flagged', () => {
    const run = toBossRound(makeRun({ rounds: 4, bossEvery: 2 }));
    expect(run.round.isBoss).toBe(true);
    expect(run.boss).toBeNull();
  });
});
