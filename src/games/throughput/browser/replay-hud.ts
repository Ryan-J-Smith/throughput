import { speedScale } from '../../../ui/motion';
import type { ThroughputRun } from '../rules';
import type { Beat, ShiftBeats } from '../spectacle';
import type { SalesReveal } from './TpHud';

// While a Shift replays, the HUD banks each sale as its beat lands, so the scoring moment plays
// out in the Sales number and bar (and a big sale lands with a hit-stop), not only at the end.

/** A sale this big a share of the round's target lands with a hit-stop and a bigger pop. */
export const BIG_SALE_SHARE = 0.25;

/** How long a big sale holds the replay before it moves on, at normal speed. */
export const HIT_STOP_MS = 100;

/** True if one sale of `amount` is big enough for a hit-stop. */
export function isBigSale(run: ThroughputRun, amount: number): boolean {
  return amount > 0 && amount >= BIG_SALE_SHARE * run.target;
}

/** Sales in the Shift before beat `index`: the sale there is this many steps up the scale. */
export function salesBefore(beats: ShiftBeats, index: number): number {
  return beats.beats.slice(0, index).filter((b) => b.earned > 0).length;
}

/**
 * The HUD after beat `index` banks its sale: Sales counts up to what the Shift has sold so far
 * (up to the Shift cap) over most of a step, with the sale's "+$" beside it. Null for a beat
 * that sold nothing.
 */
export function beatReveal(run: ThroughputRun, beat: Beat, index: number, stepMs: number): SalesReveal | null {
  if (beat.earned <= 0) return null;
  const counted = Math.min(beat.sales, run.shiftCap ?? Number.POSITIVE_INFINITY);
  return {
    from: run.sales,
    to: Math.max(0, run.sales + counted),
    ms: Math.round(stepMs * 0.7),
    sale: { key: index, amount: beat.earned, big: isBigSale(run, beat.earned) },
  };
}

/** How long the replay holds after beat `beat`: a short hit-stop on a big sale (scaled to the speed setting), else 0. */
export function hitStopMs(run: ThroughputRun, beat: Beat): number {
  return isBigSale(run, beat.earned) ? Math.round(HIT_STOP_MS * speedScale()) : 0;
}
