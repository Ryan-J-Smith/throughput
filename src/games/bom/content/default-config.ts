import type { BomConfig } from '../rules';
import { BLUEPRINTS, STARTING_BLUEPRINTS } from './blueprints';
import { DISRUPTIONS } from './disruptions';
import { FACILITIES } from './facilities';
import { BASE_CATEGORIES, PAINT, startingDeck } from './parts';

/** Revenue targets from the design doc (§5). */
export const DOC_TARGETS: readonly (readonly [number, number, number])[] = [
  [120, 180, 240],
  [400, 600, 800],
  [1100, 1650, 2200],
  [2500, 3750, 5000],
];

/** The game exactly as specified in the design doc. */
export function defaultBomConfig(): BomConfig {
  return {
    targets: DOC_TARGETS,
    rewards: { small: 3, big: 4, boss: 5 },
    startingCash: 4,
    interest: { per: 5, amount: 1, cap: 5 },
    builds: 4,
    scraps: 3,
    handSize: 8,
    benchSlots: 2,
    sellOutGrowth: 5,
    maxSelection: 5,
    blueprints: BLUEPRINTS,
    startingBlueprints: STARTING_BLUEPRINTS,
    facilities: FACILITIES,
    startingFacilities: [],
    disruptions: DISRUPTIONS,
    startingDeck,
    startingBench: () => [],
    shop: {
      rackSlots: 3,
      rackWeights: { facility: 55, blueprint: 30, rnd: 15 },
      rarityWeights: { common: 70, uncommon: 25, rare: 5 },
      rndCost: 3,
      counterSlots: 2,
      counterCost: 3,
      counterCategories: BASE_CATEGORIES,
      counterGrades: { default: [3, 5], [PAINT]: [2, 3] },
      premiumChance: 0.25,
      premiumSurcharge: 1,
      shredCost: 2,
      rerollCost: 3,
      rerollStep: 1,
      sellRate: 0.5,
      maxBlueprints: 6,
      maxFacilities: 5,
    },
  };
}
