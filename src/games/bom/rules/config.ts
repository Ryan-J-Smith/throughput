import type { InterestConfig } from '../../../engine/economy';
import type { BlueprintDef, Disruption, Facility, Part, PartCategory, Rarity } from '../model';

export type MarketKind = 'small' | 'big' | 'boss';
export const MARKETS: readonly MarketKind[] = ['small', 'big', 'boss'];

export type BomShopConfig = {
  readonly rackSlots: number;
  /** Weights for what a Rack slot rolls. */
  readonly rackWeights: { readonly facility: number; readonly blueprint: number; readonly rnd: number };
  /** Weights for the rarity of a rolled Facility or Blueprint. */
  readonly rarityWeights: Readonly<Record<Exclude<Rarity, 'starter'>, number>>;
  readonly rndCost: number;
  readonly counterSlots: number;
  readonly counterCost: number;
  readonly counterCategories: readonly PartCategory[];
  /** Inclusive grade range per category; categories not listed use `default`. */
  readonly counterGrades: Readonly<Record<string, readonly [number, number]>> & { readonly default: readonly [number, number] };
  readonly premiumChance: number;
  readonly premiumSurcharge: number;
  readonly shredCost: number;
  readonly rerollCost: number;
  readonly rerollStep: number;
  /** Fraction of cost refunded on sale (floored). */
  readonly sellRate: number;
  readonly maxBlueprints: number;
  readonly maxFacilities: number;
};

/** Everything that defines a BoM run; tests and tuning pass variations of the default. */
export type BomConfig = {
  /** Revenue targets per quarter: [small, big, boss]. */
  readonly targets: readonly (readonly [number, number, number])[];
  readonly rewards: Readonly<Record<MarketKind, number>>;
  readonly startingCash: number;
  readonly interest: InterestConfig;
  readonly builds: number;
  readonly scraps: number;
  readonly handSize: number;
  readonly benchSlots: number;
  readonly sellOutGrowth: number;
  /** Most parts in one Scrap or Ship. */
  readonly maxSelection: number;
  readonly blueprints: readonly BlueprintDef[];
  readonly startingBlueprints: readonly string[];
  readonly facilities: readonly Facility[];
  readonly startingFacilities: readonly string[];
  readonly disruptions: readonly Disruption[];
  /** Fresh part objects for each run. */
  readonly startingDeck: () => Part[];
  readonly startingBench: () => Part[];
  readonly shop: BomShopConfig;
};
