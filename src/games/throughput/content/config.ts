import type { Stage } from '../model';

/** Every tunable number of a THROUGHPUT run. Defaults follow seed-03; see DESIGN_NOTES for the gaps it left. */
export type ThroughputConfig = {
  /** Sales target per round; its length is the number of rounds. */
  readonly targets: readonly number[];
  /** Rounds per Year; the last of each Year is a Board Review. */
  readonly roundsPerYear: number;
  /** Endless (after the win): each round's target is the last configured target × this per round past it. */
  readonly endlessGrowth: number;
  readonly shiftsPerRound: number;
  readonly retoolsPerRound: number;
  /** Most cards one Retool may discard. */
  readonly retoolMax: number;
  /** Times per round an empty draw pile takes the shuffled discards when you would draw (Restock). */
  readonly restocksPerRound: number;
  readonly handSize: number;
  /** Card types the opening hand of each round always holds at least one of, if the deck has them. */
  readonly openingHandTypes: readonly Stage[];
  /** Also give the opening hand a Design while a Mod that works only on Designs is on the Line (outside a welded slot). */
  readonly designOpener: boolean;
  /** Also give the opening hand a Ship of this round's Hot Category that can sell, if the deck holds one. */
  readonly hotOpener: boolean;
  /**
   * After a later Shift's refill or a Retool, swap in a Ship from the draw pile if neither the hand
   * nor the Line has one that can sell (its Category has Demand left, or it ignores Demand).
   */
  readonly shipRefill: boolean;
  readonly startSlots: number;
  readonly maxSlots: number;
  readonly baseMargin: number;
  readonly startingCapital: number;
  /** Capital for clearing each quarter of a Year (Q1, Q2, Board). */
  readonly income: readonly number[];
  /**
   * Capital per unused Shift when a round clears, by Year (the last entry holds for later Years).
   * Board Reviews pay none: the tempo premium shrinks once engines can clear in one Shift.
   */
  readonly unusedShiftBonus: readonly number[];
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
  /**
   * Each Category's Demand: the Units it buys per round, shared by all its Ship cards. It starts at
   * `start` and grows for good when a Shift sells the last of it, by `sellOutRate` × Demand (at least
   * `sellOutGrowth`), and by `emergingGrowth` per Shift that sells the Category while it is Emerging.
   * A Saturated round has ×`saturatedMul` of it.
   */
  readonly demand: {
    readonly start: number;
    readonly sellOutGrowth: number;
    readonly sellOutRate: number;
    readonly emergingGrowth: number;
    readonly saturatedMul: number;
  };
  /**
   * R&D Grant, per level bought for a Category. Scale: +`scaleDemand` Demand and +`scaleUnits` Units at
   * each of its Ship cards. Premium: its sales ×(1 + `premiumStep` × level).
   */
  readonly grant: { readonly scaleDemand: number; readonly scaleUnits: number; readonly premiumStep: number };
};

/** seed-03's original curve, kept for comparison; it assumes multiplicative late builds the bots don't reach. */
export const SEED_03_TARGETS: readonly number[] = [150, 250, 400, 600, 900, 1300, 1800, 2600, 3600, 5000, 7000, 10000];

export const DEFAULT_CONFIG: ThroughputConfig = {
  // Playtest-2 re-fit (DESIGN_NOTES "Target re-fit from R7"): ×1.3–1.5 a round from R7, calibrated to LLM play
  // (Sonnet's Shift-1 output), not to the bots, which now win 1–3%. Playtest 3 (DESIGN_NOTES "Years 1–2 re-firmed"):
  // R1–R7 up 15–20%, since Years 1–2 were the softest part of the curve; R8–R12 unchanged.
  targets: [150, 240, 320, 420, 560, 720, 1050, 1400, 2050, 3000, 4300, 5800],
  roundsPerYear: 3,
  endlessGrowth: 1.3,
  shiftsPerRound: 4,
  retoolsPerRound: 2,
  retoolMax: 3,
  restocksPerRound: 1,
  handSize: 7,
  openingHandTypes: ['make', 'ship'],
  designOpener: true,
  hotOpener: true,
  shipRefill: true,
  startSlots: 5,
  maxSlots: 7,
  baseMargin: 2,
  startingCapital: 4,
  income: [4, 5, 6],
  // Playtest 2 (DESIGN_NOTES "Tempo premium"): +2C in Years 1–2, +1C after, none on Boards; overkill cap 5 → 3.
  unusedShiftBonus: [2, 2, 1],
  overkill: { step: 0.25, cap: 3 },
  interest: { per: 5, amount: 1, cap: 5 },
  overstockValue: 1,
  rerollBaseCost: 2,
  rerollCostIncrement: 1,
  moveCost: 1,
  sellRate: 0.5,
  hotPips: 2,
  hotMultiplier: 2,
  // BoM graft b (DESIGN_NOTES "Demand"): variant F of the sims.
  // Playtest 2: sell-out growth +50% → +25% (the +10 floor stays), so grown Demand stops shrugging off Recession.
  demand: { start: 20, sellOutGrowth: 10, sellOutRate: 0.25, emergingGrowth: 10, saturatedMul: 0.5 },
  grant: { scaleDemand: 10, scaleUnits: 3, premiumStep: 0.25 },
};
