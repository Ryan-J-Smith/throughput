import { EngineError } from '../errors';
import type { ScoreFormula } from './score-formula';

export type ScoreOp = 'add' | 'multiply' | 'set';

/** One change to a stat, kept for UI display / replay. */
export type ScoreContribution = {
  readonly source: string;
  readonly stat: string;
  readonly op: ScoreOp;
  readonly amount: number;
  readonly before: number;
  readonly after: number;
};

/**
 * Mutable score state for a single play. The evaluator and modifiers change stats through
 * add/multiply/set; every change is appended to `log` with its source.
 */
export class ScoreContext {
  private readonly formula: ScoreFormula;
  private readonly stats: Record<string, number>;
  private readonly log_: ScoreContribution[] = [];

  constructor(formula: ScoreFormula) {
    this.formula = formula;
    this.stats = { ...formula.initial };
  }

  get log(): readonly ScoreContribution[] {
    return this.log_;
  }

  get(stat: string): number {
    const value = this.stats[stat];
    if (value === undefined) throw new EngineError(`ScoreContext: unknown stat "${stat}"`);
    return value;
  }

  /** Snapshot of all current stat values. */
  values(): Readonly<Record<string, number>> {
    return { ...this.stats };
  }

  add(stat: string, amount: number, source: string): void {
    this.apply(stat, 'add', amount, source, this.get(stat) + amount);
  }

  multiply(stat: string, factor: number, source: string): void {
    this.apply(stat, 'multiply', factor, source, this.get(stat) * factor);
  }

  set(stat: string, value: number, source: string): void {
    this.apply(stat, 'set', value, source, value);
  }

  /** Current total according to the formula. */
  total(): number {
    return this.formula.compute(this.stats);
  }

  private apply(stat: string, op: ScoreOp, amount: number, source: string, after: number): void {
    const before = this.get(stat);
    this.stats[stat] = after;
    this.log_.push({ source, stat, op, amount, before, after });
  }
}
