// Simple fakes shared by the engine tests (passed in directly; no module mocking).
import type { CardDef } from '../deck';
import { Modifier } from '../modifiers';
import type { EngineEvent, EngineEventType, ModifierDef } from '../modifiers';
import { Registry } from '../registry';
import { Rng } from '../rng';
import { PlayEvaluator, Run } from '../run';
import type { RunConfig } from '../run';
import { ProductFormula } from '../scoring';
import type { ScoreContext } from '../scoring';

export type TestCard = { readonly value: number };

export const card = (value: number): TestCard => ({ value });

/** Every played card scores; base starts at 0 and each card adds its value. */
export class SumEvaluator extends PlayEvaluator<TestCard> {
  override evaluate(played: readonly TestCard[], _held: readonly TestCard[], score: ScoreContext): readonly TestCard[] {
    score.set('base', 0, 'play');
    return played;
  }

  override scoreCard(c: TestCard, score: ScoreContext): void {
    score.add('base', c.value, 'card');
  }
}

/** Records the type of every event it sees into a shared log, tagged with its id. */
export class RecordingModifier extends Modifier<TestCard> {
  private readonly log: string[];

  constructor(id: string, log: string[], price = 4) {
    super({ id, name: id, rarity: 'common', price });
    this.log = log;
  }

  override onEvent(event: EngineEvent<TestCard>): void {
    this.log.push(`${this.id}:${event.type}`);
  }
}

/** Reacts to one event type with a callback. */
export class HookModifier extends Modifier<TestCard> {
  private readonly on: EngineEventType;
  private readonly fn: (event: EngineEvent<TestCard>, self: HookModifier) => void;

  constructor(id: string, on: EngineEventType, fn: (event: EngineEvent<TestCard>, self: HookModifier) => void) {
    super({ id, name: id, rarity: 'common', price: 6 });
    this.on = on;
    this.fn = fn;
  }

  override onEvent(event: EngineEvent<TestCard>): void {
    if (event.type === this.on) this.fn(event, this);
  }
}

export const RARITIES = { common: 10, rare: 1 };

export function modifierDef(id: string, price = 4, create?: () => Modifier<TestCard>): ModifierDef<TestCard> {
  return {
    kind: 'modifier',
    id,
    name: id,
    rarity: 'common',
    price,
    create: create ?? (() => new RecordingModifier(id, [], price)),
  };
}

export function cardDef(id: string, value: number, price = 2): CardDef<TestCard> {
  return { kind: 'card', id, rarity: 'common', price, create: () => card(value) };
}

export function makeConfig(overrides: Partial<RunConfig<TestCard>> = {}): RunConfig<TestCard> {
  const modifiers = new Registry<ModifierDef<TestCard>>(RARITIES);
  for (const id of ['m1', 'm2', 'm3']) modifiers.register(modifierDef(id));
  return {
    rounds: 3,
    bossEvery: 3,
    target: (round, isBoss) => round * 10 * (isBoss ? 2 : 1),
    playsPerRound: 2,
    discardsPerRound: 1,
    handSize: 4,
    maxSelection: 3,
    modifierSlots: 2,
    startingDeck: Array.from({ length: 12 }, () => card(5)),
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
    ...overrides,
  };
}

export function makeRun(overrides: Partial<RunConfig<TestCard>> = {}, seed = 1): Run<TestCard> {
  return new Run(makeConfig(overrides), {
    rng: new Rng(seed),
    evaluator: new SumEvaluator(),
    formula: new ProductFormula({ base: 0, multiplier: 1 }),
  });
}
