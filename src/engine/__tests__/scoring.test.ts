import { describe, expect, it } from 'vitest';
import { EngineError } from '../errors';
import { ProductFormula, ScoreContext, ScoreFormula } from '../scoring';

class SumFormula extends ScoreFormula {
  readonly initial = { revenue: 0, bonus: 0 };
  override compute(stats: Readonly<Record<string, number>>): number {
    return (stats.revenue ?? 0) + (stats.bonus ?? 0);
  }
}

describe('ProductFormula', () => {
  it('multiplies and floors all stats', () => {
    const formula = new ProductFormula({ base: 0, multiplier: 1 });
    expect(formula.compute({ base: 10, multiplier: 2.55 })).toBe(25);
  });
});

describe('ScoreContext', () => {
  it('starts from the formula initial values', () => {
    const score = new ScoreContext(new ProductFormula({ base: 0, multiplier: 1 }));
    expect(score.values()).toEqual({ base: 0, multiplier: 1 });
    expect(score.total()).toBe(0);
  });

  it('applies add/multiply/set and logs each contribution', () => {
    const score = new ScoreContext(new ProductFormula({ base: 0, multiplier: 1 }));
    score.set('base', 10, 'hand');
    score.add('multiplier', 2, 'mod A');
    score.multiply('multiplier', 2, 'mod B');
    expect(score.total()).toBe(60);
    expect(score.log).toEqual([
      { source: 'hand', stat: 'base', op: 'set', amount: 10, before: 0, after: 10 },
      { source: 'mod A', stat: 'multiplier', op: 'add', amount: 2, before: 1, after: 3 },
      { source: 'mod B', stat: 'multiplier', op: 'multiply', amount: 2, before: 3, after: 6 },
    ]);
  });

  it('works with any pluggable formula', () => {
    const score = new ScoreContext(new SumFormula());
    score.add('revenue', 30, 'sale');
    score.add('bonus', 5, 'promo');
    expect(score.total()).toBe(35);
  });

  it('rejects stats the formula does not define', () => {
    const score = new ScoreContext(new SumFormula());
    expect(() => score.add('mult', 1, 'x')).toThrow(EngineError);
    expect(() => score.get('mult')).toThrow(EngineError);
  });
});
