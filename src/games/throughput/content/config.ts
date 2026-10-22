/** Every tunable number of a THROUGHPUT run. Defaults follow seed-03; see DESIGN_NOTES for the gaps it left. */
export type ThroughputConfig = {
  /** Sales target per round; its length is the number of rounds. */
  readonly targets: readonly number[];
  /** Rounds per Year; the last of each Year is a Board Review. */
  readonly roundsPerYear: number;
  readonly shiftsPerRound: number;
  readonly retoolsPerRound: number;
  /** Most cards one Retool may discard. */
  readonly retoolMax: number;
  readonly handSize: number;
  readonly startSlots: number;
  readonly maxSlots: number;
  readonly baseMargin: number;
  readonly startingCapital: number;
  /** Capital for clearing each quarter of a Year (Q1, Q2, Board). */
  readonly income: readonly number[];
  readonly unusedShiftBonus: number;
  /**
   * Overkill pay when a round clears: +1C per full `step` × target of Sales beyond the target, at
   * most `cap`C a round (BoM's Overtime pay, grafted as the tempo lever).
   */
  readonly overkill: { readonly step: number; readonly cap: number };
  readonly interest: { readonly per: number; readonly amount: number; readonly cap: number };
  readonly overstockValue: number;
  readonly rerollBaseCost: number;
  readonly rerollCostIncrement: number;
  readonly moveCost: number;
  readonly sellRate: number;
  /** Shifts per round that sell the Hot Category at ×2. */
  readonly hotPips: number;
  readonly hotMultiplier: number;
  readonly saturatedCapMul: number;
  /** Equity at which a Category is Loyal and shrugs off Saturation. */
  readonly loyalEquity: number;
  readonly warehouseCap: number;
  /** Units per 1C of storage fee (rounded up). */
  readonly storagePerCapital: number;
};

/** seed-03's original curve, kept for comparison; it assumes multiplicative late builds the bots don't reach. */
export const SEED_03_TARGETS: readonly number[] = [150, 250, 400, 600, 900, 1300, 1800, 2600, 3600, 5000, 7000, 10000];

export const DEFAULT_CONFIG: ThroughputConfig = {
  // First-pass sim tune (DESIGN_NOTES "Sim tuning"): best bot wins ~30%, tempo and slow-burn cross at Y2.
  targets: [150, 250, 350, 450, 600, 800, 1000, 1250, 1500, 1750, 2050, 2350],
  roundsPerYear: 3,
  shiftsPerRound: 4,
  retoolsPerRound: 2,
  retoolMax: 3,
  handSize: 7,
  startSlots: 5,
  maxSlots: 7,
  baseMargin: 2,
  startingCapital: 4,
  income: [4, 5, 6],
  unusedShiftBonus: 2,
  overkill: { step: 0.25, cap: 5 },
  interest: { per: 5, amount: 1, cap: 5 },
  overstockValue: 1,
  rerollBaseCost: 2,
  rerollCostIncrement: 1,
  moveCost: 1,
  sellRate: 0.5,
  hotPips: 2,
  hotMultiplier: 2,
  saturatedCapMul: 0.5,
  loyalEquity: 3,
  warehouseCap: 40,
  storagePerCapital: 10,
};
