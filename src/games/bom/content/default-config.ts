import type { BomConfig } from '../rules';
import { BLUEPRINTS, STARTING_BLUEPRINTS } from './blueprints';
import { DISRUPTIONS } from './disruptions';
import { FACILITIES } from './facilities';
import { BASE_CATEGORIES, PAINT, startingDeck } from './parts';

/** Revenue targets from the design doc (§5). No sim bot clears Q2 with them (see DESIGN_NOTES "Tuning"). */
export const DOC_TARGETS: readonly (readonly [number, number, number])[] = [
  [120, 180, 240],
  [400, 600, 800],
  [1100, 1650, 2200],
  [2500, 3750, 5000],
];

/**
 * Sim-tuned targets: 21.4× from Q1 Small to the Q4 Boss, so tempo stalls in Q4 while slow-burn
 * engines pull ahead. Re-centred +5% for Overtime Ship pay (DESIGN_NOTES "Tuning").
 */
export const TUNED_TARGETS: readonly (readonly [number, number, number])[] = [
  [105, 145, 190],
  [230, 295, 335],
  [380, 505, 650],
  [1050, 1525, 2250],
];

/** The game as specified in the design doc, with the tuning in DESIGN_NOTES "Tuning" applied. */
export function defaultBomConfig(): BomConfig {
  return {
    targets: TUNED_TARGETS,
    // Tuned from the doc's $3/$4/$5 so committed engines can assemble.
    rewards: { small: 5, big: 6, boss: 8 },
    startingCash: 4,
    interest: { per: 5, amount: 1, cap: 5 },
    builds: 4,
    scraps: 3,
    handSize: 8,
    benchSlots: 2,
    sellOutGrowth: 5,
    // Approved rule change (DESIGN_NOTES "Overtime"): Overtime Ships pay cash.
    overtimeShip: { step: 0.25, cap: 5 },
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
