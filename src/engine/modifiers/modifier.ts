import type { EngineEvent } from './events';

export type ModifierInfo = {
  readonly id: string;
  readonly name: string;
  /** Player-facing rules text. */
  readonly description: string;
  readonly rarity: string;
  readonly price: number;
};

/**
 * A persistent effect owned by the player (Balatro's jokers). Subclasses override `onEvent`
 * and switch on `event.type`; they react by mutating the objects carried on the event
 * (score context, payout, run). Instances may hold their own state (e.g. scaling counters).
 */
export abstract class Modifier<TCard> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rarity: string;
  readonly price: number;

  constructor(info: ModifierInfo) {
    this.id = info.id;
    this.name = info.name;
    this.description = info.description;
    this.rarity = info.rarity;
    this.price = info.price;
  }

  /** Called for every engine event, in slot order. Default: ignore. */
  onEvent(_event: EngineEvent<TCard>): void {}
}
