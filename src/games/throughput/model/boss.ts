/**
 * A Board Review rule, active for one Board round. Every hook defaults to the normal rules, so
 * each boss overrides only what it changes.
 */
export abstract class BoardBoss {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly text: string;
  /** A 2–4 word gist for tight spots like the Market's Board list (e.g. "Slot 3 welded"); `text` is the full rule. */
  abstract readonly short: string;
  /** The build this boss leans on (for design notes and reports). */
  abstract readonly pressures: string;
  /** The first Year this boss can be drawn for; later-Year bosses wait until engines exist to test. */
  readonly earliestYear: number = 1;

  /** True if this 0-based slot is unusable this round. */
  isWelded(_slot: number): boolean {
    return false;
  }

  /** False if Designs are dispatched like every other card. */
  designsStay(): boolean {
    return true;
  }

  /** Value of each Unit left over at the end of a Shift. */
  overstockValue(normal: number): number {
    return normal;
  }

  warehouseOpen(): boolean {
    return true;
  }

  /** Rearranges the fixtures (by slot) at the start of Shift `shift` (1-based). */
  shiftFixtures<T>(fixtures: readonly T[], _shift: number): T[] {
    return [...fixtures];
  }

  /** True if this boss moves Fixtures during the round (for notices; `shiftFixtures` does the moving). */
  movesFixtures(): boolean {
    return false;
  }

  /** True if cards parked from earlier Shifts may be unloaded back to hand this round. */
  recallsParked(): boolean {
    return false;
  }

  /** Multiplier on every Category's Demand this round. */
  demandMul(): number {
    return 1;
  }

  /** False if Design cards' Margin × (Influencer, Rebrand) don't apply this round; their +$ still do. */
  designMultipliers(): boolean {
    return true;
  }

  /** Shifts this round, given the normal number. */
  shiftsPerRound(normal: number): number {
    return normal;
  }

  /** The share of the round's target one Shift can count toward Sales; null for no limit. */
  shiftQuota(): number | null {
    return null;
  }
}
