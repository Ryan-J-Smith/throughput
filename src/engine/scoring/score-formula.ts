/**
 * Defines which stats a play's score is built from and how they combine into a total.
 * Swap implementations to change the scoring model (chips × mult, additive, etc.).
 */
export abstract class ScoreFormula {
  /** Stat names and their starting values for every play. */
  abstract readonly initial: Readonly<Record<string, number>>;

  /** Combines the final stat values into the play's total score. */
  abstract compute(stats: Readonly<Record<string, number>>): number;
}

/** Total is the floored product of all stats — e.g. `{ base: 0, multiplier: 1 }` gives base × multiplier. */
export class ProductFormula extends ScoreFormula {
  readonly initial: Readonly<Record<string, number>>;

  constructor(initial: Readonly<Record<string, number>>) {
    super();
    this.initial = { ...initial };
  }

  override compute(stats: Readonly<Record<string, number>>): number {
    let total = 1;
    for (const name of Object.keys(this.initial)) total *= stats[name] ?? 0;
    return Math.floor(total);
  }
}
