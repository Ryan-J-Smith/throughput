// PLACEHOLDER content so the sim pipeline has something to run before the real design lands.
// Not game content; replace this scenario once src/content/ is populated.
import { BossRule } from '../../engine/bosses';
import type { BossDef } from '../../engine/bosses';
import type { CardDef } from '../../engine/deck';
import { Modifier } from '../../engine/modifiers';
import type { EngineEvent, ModifierDef, ModifierInfo } from '../../engine/modifiers';
import { Registry } from '../../engine/registry';
import { Rng } from '../../engine/rng';
import { PlayEvaluator, Run } from '../../engine/run';
import type { RoundRules, RunConfig } from '../../engine/run';
import { ProductFormula } from '../../engine/scoring';
import type { ScoreContext } from '../../engine/scoring';

export type DemoCard = { readonly value: number };

const RARITIES = { common: 10, uncommon: 4, rare: 1 };

/** base = sum of card values, multiplier = number of cards played. */
export class DemoEvaluator extends PlayEvaluator<DemoCard> {
  override evaluate(played: readonly DemoCard[], _held: readonly DemoCard[], score: ScoreContext): readonly DemoCard[] {
    score.set('multiplier', played.length, `${played.length}-card play`);
    return played;
  }

  override scoreCard(card: DemoCard, score: ScoreContext): void {
    score.add('base', card.value, `card ${card.value}`);
  }
}

class FlatBase extends Modifier<DemoCard> {
  static readonly info: ModifierInfo = { id: 'flat-base', name: 'Flat Base', description: '+8 base every play', rarity: 'common', price: 4 };
  constructor() {
    super(FlatBase.info);
  }
  override onEvent(event: EngineEvent<DemoCard>): void {
    if (event.type === 'beforeScore') event.score.add('base', 8, this.name);
  }
}

class HighRoller extends Modifier<DemoCard> {
  static readonly info: ModifierInfo = { id: 'high-roller', name: 'High Roller', description: '+4 base per scoring card of 7+', rarity: 'uncommon', price: 5 };
  constructor() {
    super(HighRoller.info);
  }
  override onEvent(event: EngineEvent<DemoCard>): void {
    if (event.type === 'scoreStep' && event.card.value >= 7) event.score.add('base', 4, this.name);
  }
}

class Amplifier extends Modifier<DemoCard> {
  static readonly info: ModifierInfo = { id: 'amplifier', name: 'Amplifier', description: '×1.5 multiplier every play', rarity: 'rare', price: 8 };
  constructor() {
    super(Amplifier.info);
  }
  override onEvent(event: EngineEvent<DemoCard>): void {
    if (event.type === 'beforeScore') event.score.multiply('multiplier', 1.5, this.name);
  }
}

class ShortHand extends BossRule<DemoCard> {
  constructor() {
    super({ id: 'short-hand', name: 'Short Hand', description: 'Hand size −2' });
  }
  override adjustRoundConfig(rules: RoundRules): RoundRules {
    return { ...rules, handSize: rules.handSize - 2 };
  }
}

class Steep extends BossRule<DemoCard> {
  constructor() {
    super({ id: 'steep', name: 'Steep', description: 'Target ×1.5' });
  }
  override adjustRoundConfig(rules: RoundRules): RoundRules {
    return { ...rules, target: Math.round(rules.target * 1.5) };
  }
}

const modifierDef = (info: ModifierInfo, create: () => Modifier<DemoCard>): ModifierDef<DemoCard> => ({ kind: 'modifier', ...info, create });
const bossDef = (id: string, create: () => BossRule<DemoCard>): BossDef<DemoCard> => {
  const sample = create();
  return { kind: 'boss', id, name: sample.name, description: sample.description, rarity: 'common', price: 0, create };
};

export function demoConfig(): RunConfig<DemoCard> {
  const modifiers = new Registry<ModifierDef<DemoCard>>(RARITIES);
  modifiers.register(modifierDef(FlatBase.info, () => new FlatBase()));
  modifiers.register(modifierDef(HighRoller.info, () => new HighRoller()));
  modifiers.register(modifierDef(Amplifier.info, () => new Amplifier()));

  const cards = new Registry<CardDef<DemoCard>>(RARITIES);
  const ten: CardDef<DemoCard> = { kind: 'card', id: 'ten', rarity: 'common', price: 3, create: () => ({ value: 10 }) };
  cards.register(ten);

  const bosses = new Registry<BossDef<DemoCard>>(RARITIES);
  bosses.register(bossDef('short-hand', () => new ShortHand()));
  bosses.register(bossDef('steep', () => new Steep()));

  const startingDeck: DemoCard[] = [];
  for (let value = 1; value <= 10; value++) for (let copy = 0; copy < 4; copy++) startingDeck.push({ value });

  return {
    rounds: 8,
    bossEvery: 4,
    target: (round) => Math.round(120 * 1.45 ** (round - 1)),
    playsPerRound: 4,
    discardsPerRound: 3,
    handSize: 8,
    maxSelection: 5,
    modifierSlots: 5,
    startingDeck,
    startingCash: 4,
    roundReward: (_round, isBoss) => (isBoss ? 5 : 3),
    cashPerUnusedPlay: 1,
    cashPerUnusedDiscard: 0,
    interest: { per: 5, amount: 1, cap: 5 },
    shop: {
      slots: 2,
      pools: [
        { id: 'modifiers', registry: modifiers, weight: 3 },
        { id: 'cards', registry: cards, weight: 1 },
      ],
      rerollBaseCost: 3,
      rerollCostIncrement: 1,
      sellRate: 0.5,
    },
    bossPool: bosses,
  };
}

export function demoRun(seed: number): Run<DemoCard> {
  return new Run(demoConfig(), {
    rng: new Rng(seed),
    evaluator: new DemoEvaluator(),
    formula: new ProductFormula({ base: 0, multiplier: 1 }),
  });
}
