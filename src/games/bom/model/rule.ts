import type { ScoreContext } from '../../../engine/scoring';
import type { OwnedBlueprint, Rarity } from './blueprint';
import type { Part } from './part';

/** Round parameters that facilities and disruptions may change. */
export type RoundMods = {
  builds: number;
  scraps: number;
  handSize: number;
  benchSlots: number;
  /** Demand gained when a Product sells out. */
  sellOutGrowth: number;
  /** Whether repeat Ships of a Product halve its Demand. */
  demandHalves: boolean;
};

/** Everything a rule may read while a Ship is scored; it changes the score through `score`. */
export type ShipContext = {
  readonly blueprint: OwnedBlueprint;
  /** All selected parts, recipe and filler. */
  readonly parts: readonly Part[];
  readonly score: ScoreContext;
  /** First Ship of the round, of any Product. */
  readonly isFirstShip: boolean;
  readonly priorShipsOfThis: number;
  /** Distinct Products shipped this round, including this one. */
  readonly distinctShipped: number;
  /** R&D levels across all owned blueprints. */
  readonly rndLevelsOwned: number;
  /** Ids of the blueprints shipped most often this run, before this Ship. */
  readonly mostShipped: ReadonlySet<string>;
};

/** A Fabricate in progress; rules add grade bonuses or extra copies. */
export type FabContext = {
  readonly sub: OwnedBlueprint;
  readonly inputs: readonly Part[];
  bonus: number;
  /** Extra copies benched at half grade (if there is room). */
  copies: number;
};

export type RuleInfo = {
  readonly id: string;
  readonly name: string;
  /** Player-facing rules text. */
  readonly text: string;
};

/**
 * Shared hook surface for Facilities and Disruptions. Hooks default to doing nothing; additive
 * Ship effects go in onShipAdd and multiplicative ones in shipMultiplier, so order never matters.
 */
export abstract class BomRule {
  readonly id: string;
  readonly name: string;
  readonly text: string;

  constructor(info: RuleInfo) {
    this.id = info.id;
    this.name = info.name;
    this.text = info.text;
  }

  /** Changes round parameters (Builds, Bench slots, sell-out growth, …). */
  adjust(_mods: RoundMods): void {}

  /** Additive phase of Ship scoring: change units, price or demand via ship.score. */
  onShipAdd(_ship: ShipContext): void {}

  /** Multiplicative phase of Ship scoring; 1 means no effect. */
  shipMultiplier(_ship: ShipContext): number {
    return 1;
  }

  onFabricate(_fab: FabContext): void {}

  /** Called as a round starts (after the deck reset), with the Bench it may change. */
  onRoundStart(_bench: Part[]): void {}
}

/** A permanent building bought in the shop. */
export abstract class Facility extends BomRule {
  abstract readonly rarity: Exclude<Rarity, 'starter'>;
  abstract readonly cost: number;
}

/** A Market Disruption: revealed at its quarter's first shop, active in that quarter's Boss round. */
export abstract class Disruption extends BomRule {}
