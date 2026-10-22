import { ScoreFormula } from '../../../engine/scoring';

/** Stat names in a Ship's ScoreContext. */
export const UNITS = 'units';
export const PRICE = 'price';
export const DEMAND = 'demand';
export const MARKUP = 'markup';

/** Revenue = floor(min(Units, Demand) × Price × Markup). */
export class BomFormula extends ScoreFormula {
  readonly initial = { [UNITS]: 0, [PRICE]: 0, [DEMAND]: 0, [MARKUP]: 1 };

  override compute(stats: Readonly<Record<string, number>>): number {
    const units = stats[UNITS] ?? 0;
    const demand = stats[DEMAND] ?? 0;
    const value = Math.min(units, demand) * (stats[PRICE] ?? 0) * (stats[MARKUP] ?? 1);
    // The epsilon absorbs float error from fractional multipliers (e.g. 1.1 × 1.6).
    return Math.max(0, Math.floor(value + 1e-9));
  }
}
