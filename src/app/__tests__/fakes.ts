// Small engine game for controller tests (passed in directly; no module mocking).
import { BossRule } from '../../engine/bosses';
import type { BossDef } from '../../engine/bosses';
import { Modifier } from '../../engine/modifiers';
import type { EngineEvent, ModifierDef, ModifierInfo } from '../../engine/modifiers';
import { Registry } from '../../engine/registry';
import { PlayEvaluator } from '../../engine/run';
import type { RoundRules, RunConfig } from '../../engine/run';
import { ProductFormula } from '../../engine/scoring';
import type { ScoreContext } from '../../engine/scoring';
import { ContentPresenter } from '../ContentPresenter';
import type { CardFace } from '../ContentPresenter';
import { GameDefinition } from '../GameDefinition';

export type TestCard = { readonly value: number };

/** Every played card scores its value into base. */
export class SumEvaluator extends PlayEvaluator<TestCard> {
  override evaluate(played: readonly TestCard[], _held: readonly TestCard[], _score: ScoreContext): readonly TestCard[] {
    return played;
  }

  override scoreCard(card: TestCard, score: ScoreContext): void {
    score.add('base', card.value, `card ${card.value}`);
  }
}

/** +1 multiplier every play and a $2 payout line on wins. */
export class PlusMod extends Modifier<TestCard> {
  static readonly info: ModifierInfo = { id: 'plus', name: 'Plus', description: '+1 multiplier', rarity: 'common', price: 3 };

  constructor() {
    super(PlusMod.info);
  }

  override onEvent(event: EngineEvent<TestCard>): void {
    if (event.type === 'beforeScore') event.score.add('multiplier', 1, this.name);
    if (event.type === 'roundEnd' && event.won) event.payout.add('Plus bonus', 2);
  }
}

/** ×2 multiplier every play; unaffordable unless a test raises starting cash. */
export class PricyMod extends Modifier<TestCard> {
  static readonly info: ModifierInfo = { id: 'pricy', name: 'Pricy', description: '×2 multiplier', rarity: 'rare', price: 100 };

  constructor() {
    super(PricyMod.info);
  }

  override onEvent(event: EngineEvent<TestCard>): void {
    if (event.type === 'beforeScore') event.score.multiply('multiplier', 2, this.name);
  }
}

export class TightBoss extends BossRule<TestCard> {
  constructor() {
    super({ id: 'tight', name: 'Tight', description: 'One fewer play and card in hand' });
  }

  override adjustRoundConfig(rules: RoundRules): RoundRules {
    return { ...rules, plays: rules.plays - 1, handSize: rules.handSize - 1 };
  }
}

export class TestPresenter extends ContentPresenter<TestCard> {
  override presentCard(card: TestCard): CardFace {
    return { title: `Card ${card.value}`, description: '', tags: [], value: card.value };
  }
}

const modDef = (info: ModifierInfo, create: () => Modifier<TestCard>): ModifierDef<TestCard> => ({ kind: 'modifier', ...info, create });

/**
 * Two rounds; round 2 is a Tight boss round. Hands are 4 cards worth 5 each, so playing three
 * cards scores 15 (×2 with Plus) against targets of 10 and 20.
 */
export class TestGame extends GameDefinition<TestCard> {
  readonly formula = new ProductFormula({ base: 0, multiplier: 1 });
  readonly evaluator = new SumEvaluator();
  readonly presenter = new TestPresenter();
  private readonly overrides: Partial<RunConfig<TestCard>>;

  constructor(overrides: Partial<RunConfig<TestCard>> = {}) {
    super();
    this.overrides = overrides;
  }

  override createConfig(): RunConfig<TestCard> {
    const modifiers = new Registry<ModifierDef<TestCard>>({ common: 1, rare: 1 });
    modifiers.register(modDef(PlusMod.info, () => new PlusMod()));
    modifiers.register(modDef(PricyMod.info, () => new PricyMod()));
    const bosses = new Registry<BossDef<TestCard>>({ common: 1 });
    bosses.register({ kind: 'boss', id: 'tight', name: 'Tight', description: '', rarity: 'common', price: 0, create: () => new TightBoss() });
    return {
      rounds: 2,
      bossEvery: 2,
      target: (round) => round * 10,
      playsPerRound: 2,
      discardsPerRound: 1,
      handSize: 4,
      maxSelection: 3,
      modifierSlots: 1,
      startingDeck: Array.from({ length: 12 }, () => ({ value: 5 })),
      startingCash: 4,
      roundReward: () => 3,
      cashPerUnusedPlay: 1,
      cashPerUnusedDiscard: 0,
      interest: { per: 5, amount: 1, cap: 5 },
      shop: {
        slots: 2,
        pools: [{ id: 'modifiers', registry: modifiers, weight: 1 }],
        rerollBaseCost: 2,
        rerollCostIncrement: 1,
        sellRate: 0.5,
      },
      bossPool: bosses,
      ...this.overrides,
    };
  }
}
