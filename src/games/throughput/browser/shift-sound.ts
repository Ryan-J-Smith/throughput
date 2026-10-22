import type { SoundPlayer } from '../../../ui/sound';
import type { ShiftResult, ThroughputRun } from '../rules';
import type { Beat } from '../spectacle';

// The Shift's sounds follow the belt replay (spectacle/ShiftReplay): a roll as the robot moves to
// each slot, a ding as a sale pops, and a chord or thud as the total lands.

/** What running `result` will do to the round: hit its target, miss it (losing the run), or neither yet. */
export type ShiftOutcome = 'hit' | 'miss' | 'none';

/** The outcome of running `result` now, read before the Run is applied. */
export function shiftOutcome(run: ThroughputRun, result: ShiftResult): ShiftOutcome {
  if (Math.max(0, run.sales + result.total) >= run.target) return 'hit';
  return run.shift >= run.shiftsThisRound ? 'miss' : 'none';
}

/** 0 to 1 on a log scale, for a sale ding's pitch: $1 is 0, $512 and up is 1. */
export function saleIntensity(amount: number): number {
  return Math.min(1, Math.log2(Math.max(1, amount)) / 9);
}

/** Where in a beat a sale's "+$" pop peaks (spectacle.css tp-pop), as a share of the step. */
const SALE_AT_STEP = 0.4;

/** One slot of the replay: a roll (softer past an empty or welded slot), then a ding if its Ship sold. */
export function playBeat(sound: SoundPlayer, beat: Beat, stepMs: number): void {
  sound.play('slot', { intensity: beat.kind === 'card' || beat.kind === 'fixture' ? 1 : 0.4 });
  if (beat.earned > 0) sound.play('sale', { delayMs: stepMs * SALE_AT_STEP, intensity: saleIntensity(beat.earned) });
}

/** The replay's finale: a chord if the Shift hit the target, a thud if it missed it, timed to the total landing. */
export function playFinale(sound: SoundPlayer, outcome: ShiftOutcome, landMs: number): void {
  if (outcome !== 'none') sound.play(outcome, { delayMs: landMs });
}

/** A Shift run with no replay (reduced motion): one ding for what it sold, then the outcome. */
export function playShiftAtOnce(sound: SoundPlayer, result: ShiftResult, outcome: ShiftOutcome): void {
  if (result.shipSales > 0) sound.play('sale', { intensity: saleIntensity(result.shipSales) });
  playFinale(sound, outcome, result.shipSales > 0 ? 120 : 0);
}
