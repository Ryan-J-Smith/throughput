import { describe, expect, it } from 'vitest';
import type { ScoreTallyView } from '../types';
import { formatContribution, formatNumber, tallyFrame } from './tally';

const tally: ScoreTallyView = {
  id: 't',
  finalTotal: 99,
  contributions: [
    { id: '1', sourceLabel: 'Start', kind: 'note', amount: 0, runningA: 0, runningB: 1 },
    { id: '2', sourceLabel: 'Card', kind: 'add', amount: 10, runningA: 10, total: 10 },
    { id: '3', sourceLabel: 'Mod', kind: 'xmult', amount: 2, runningB: 2, total: 20 },
  ],
};

describe('tallyFrame', () => {
  it('shows nothing before any step', () => {
    expect(tallyFrame(tally, 0, false)).toEqual({ a: undefined, b: undefined, total: 0 });
  });

  it('carries forward the latest value each step reported', () => {
    expect(tallyFrame(tally, 2, false)).toEqual({ a: 10, b: 1, total: 10 });
    expect(tallyFrame(tally, 3, false)).toEqual({ a: 10, b: 2, total: 20 });
  });

  it('final shows the final total, not the last running total', () => {
    expect(tallyFrame(tally, 3, true).total).toBe(99);
  });
});

describe('formatting', () => {
  it('formats numbers', () => {
    expect(formatNumber(3)).toBe('3');
    expect(formatNumber(2.25)).toBe('2.3');
  });

  it('formats each contribution kind', () => {
    const base = { id: 'x', sourceLabel: 'x' };
    expect(formatContribution({ ...base, kind: 'add', amount: 12 })).toBe('+12');
    expect(formatContribution({ ...base, kind: 'mult', amount: -1 })).toBe('-1');
    expect(formatContribution({ ...base, kind: 'xmult', amount: 1.5 })).toBe('×1.5');
    expect(formatContribution({ ...base, kind: 'note', amount: 0 })).toBe('');
  });
});
