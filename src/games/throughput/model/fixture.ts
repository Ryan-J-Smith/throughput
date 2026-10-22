import type { Batch } from './batch';
import type { Card, Rarity } from './types';

/** What a fixture can see when the Batch reaches its slot. */
export type SlotContext = {
  /** The card in this slot; always null for a Station. */
  readonly card: Card | null;
  /** Cards in the slots just before this one, nearest first (null for empty, Station or welded). */
  readonly previous: readonly (Card | null)[];
};

/**
 * Behaviour of a fixture installed in a Line slot. Every hook defaults to "no effect", so each
 * fixture overrides only what it changes.
 */
export abstract class FixtureEffect {
  /** Runs when the Batch reaches this slot: after the handoff, before the card here resolves. */
  onSlot(_batch: Batch, _here: SlotContext): void {}

  /** How many times the card here resolves. */
  resolveCount(_card: Card): number {
    return 1;
  }

  /**
   * Extra Margin multiplier on a sale made by the card here. `batch` is the Batch selling; it is
   * absent when a view asks for the standing value (a plate's "Now ×"), so Shift-dependent effects return 1.
   */
  saleMultiplier(_card: Card, _fixture: Fixture, _batch?: Batch): number {
    return 1;
  }

  /** Runs each time the card here finishes resolving. */
  afterResolve(_card: Card, _batch: Batch): void {}

  /** True if the card here stays on the Line at dispatch. */
  keepsOnLine(_card: Card): boolean {
    return false;
  }

  /** False if this Fixture never does anything for this card (e.g. Quality Lab under a Ship card); traces mark it idle. */
  appliesTo(_card: Card): boolean {
    return true;
  }
}

export type FixtureKind = 'mod' | 'station';

export type FixtureDef = {
  readonly id: string;
  readonly name: string;
  /** A Mod sits under a card; a Station fills the slot itself and breaks handoffs. */
  readonly kind: FixtureKind;
  readonly rarity: Rarity;
  readonly price: number;
  readonly text: string;
  /** A 2–4 word gist for the bay plate (e.g. "+$1 per Make before"); the plate shows `text` without one. */
  readonly short?: string;
  readonly effect: FixtureEffect;
};

/** A fixture the player owns, installed in a slot. */
export type Fixture = {
  readonly uid: number;
  readonly def: FixtureDef;
  readonly paid: number;
  /** Rounds cleared since it was bought (Flagship Store grows with this). */
  roundsOwned: number;
};
