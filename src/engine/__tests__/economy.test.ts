import { describe, expect, it } from 'vitest';
import { Payout, Wallet, computeInterest, interestCeiling } from '../economy';
import { EngineError } from '../errors';

describe('Wallet', () => {
  it('earns and spends', () => {
    const wallet = new Wallet(10);
    wallet.earn(5);
    wallet.spend(12);
    expect(wallet.cash).toBe(3);
    expect(wallet.canAfford(3)).toBe(true);
    expect(wallet.canAfford(4)).toBe(false);
  });

  it('refuses overspending and negative amounts', () => {
    const wallet = new Wallet(2);
    expect(() => wallet.spend(3)).toThrow(EngineError);
    expect(() => wallet.earn(-1)).toThrow(EngineError);
    expect(() => wallet.spend(-1)).toThrow(EngineError);
  });
});

describe('computeInterest', () => {
  const config = { per: 5, amount: 1, cap: 5 };
  it('pays per full step, capped', () => {
    expect(computeInterest(4, config)).toBe(0);
    expect(computeInterest(14, config)).toBe(2);
    expect(computeInterest(100, config)).toBe(5);
  });
  it('tops out at a ceiling: the least cash that earns the cap', () => {
    expect(interestCeiling(config)).toBe(25);
    expect(computeInterest(interestCeiling(config) - 1, config)).toBeLessThan(5);
    expect(interestCeiling({ per: 4, amount: 2, cap: 5 })).toBe(12);
    expect(computeInterest(12, { per: 4, amount: 2, cap: 5 })).toBe(5);
  });
  it('pays nothing on non-positive cash', () => {
    expect(computeInterest(-20, config)).toBe(0);
  });
});

describe('Payout', () => {
  it('itemizes lines and totals them, floored at zero', () => {
    const payout = new Payout();
    payout.add('reward', 4);
    payout.add('interest', 2);
    expect(payout.lines).toEqual([
      { source: 'reward', amount: 4 },
      { source: 'interest', amount: 2 },
    ]);
    expect(payout.total()).toBe(6);
    payout.add('penalty', -10);
    expect(payout.total()).toBe(0);
  });
});
