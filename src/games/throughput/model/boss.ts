/**
 * A Board Review rule, active for one Board round. Every hook defaults to the normal rules, so
 * each boss overrides only what it changes.
 */
export abstract class BoardBoss {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly text: string;
  /** The build this boss leans on (for design notes and reports). */
  abstract readonly pressures: string;

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

  /** Rearranges the fixtures (by slot) at the start of each Shift. */
  shiftFixtures<T>(fixtures: readonly T[]): T[] {
    return [...fixtures];
  }
}
