import type { ScoreContributionView, ScoreTallyView, TallySpeed } from '../types';

export const TALLY_TIMING: Readonly<Record<TallySpeed, { stepMs: number; holdMs: number }>> = {
  slow: { stepMs: 750, holdMs: 1400 },
  normal: { stepMs: 420, holdMs: 900 },
  fast: { stepMs: 160, holdMs: 450 },
};

export const NEXT_SPEED: Readonly<Record<TallySpeed, TallySpeed>> = {
  slow: 'normal',
  normal: 'fast',
  fast: 'slow',
};

export type TallyFrame = {
  a: number | undefined;
  b: number | undefined;
  total: number;
};

/**
 * What the readouts should show once `revealed` contributions have played.
 * Each value is the latest one any revealed step reported; `final` swaps in the final total.
 */
export function tallyFrame(tally: ScoreTallyView, revealed: number, final: boolean): TallyFrame {
  let a: number | undefined;
  let b: number | undefined;
  let total = 0;
  for (const c of tally.contributions.slice(0, revealed)) {
    if (c.runningA !== undefined) a = c.runningA;
    if (c.runningB !== undefined) b = c.runningB;
    if (c.total !== undefined) total = c.total;
  }
  return { a, b, total: final ? tally.finalTotal : total };
}

/** Integers render bare; fractional values get one decimal. */
export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatContribution(c: ScoreContributionView): string {
  switch (c.kind) {
    case 'add':
    case 'mult':
      return `${c.amount < 0 ? '' : '+'}${formatNumber(c.amount)}`;
    case 'xmult':
      return `×${formatNumber(c.amount)}`;
    case 'note':
      return '';
  }
}
