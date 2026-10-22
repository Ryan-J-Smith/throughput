import { DEFAULT_CONFIG } from '../content';
import type { ThroughputConfig } from '../content';
import { ThroughputRun } from '../rules';

/** A run parked where the Line shows every bay state at once, and how it got there. */
export type QaScene = { readonly run: ThroughputRun; readonly notes: readonly string[] };

/** Deep pockets, a $1 first round and an unreachable Board target, so the Board round stays open for a second Shift. */
const QA_CONFIG: ThroughputConfig = { ...DEFAULT_CONFIG, startingCapital: 999, roundsPerYear: 2, targets: DEFAULT_CONFIG.targets.map((t, i) => (i === 0 ? 1 : t * 1000)) };

/**
 * Plays a run through the public API to a Board round under `bossId` with Fixtures in most bays:
 * Stations and Mods (some idle under the card loaded there), a welded bay when the boss welds,
 * cards parked from Shift 1 beside cards loaded this Shift.
 */
export function buildQaScene(bossId = 'supply-shock', config: ThroughputConfig = QA_CONFIG): QaScene {
  const notes: string[] = [];
  let seed = 1;
  while (seed < 500 && new ThroughputRun(seed, config).boardBosses[0]?.id !== bossId) seed++;
  const run = new ThroughputRun(seed, config);
  notes.push(`seed ${seed}, Board: ${run.boardBosses[0]?.name ?? 'none'}`);

  // Round 1: load what fits and run until the round closes.
  for (let guard = 0; run.phase === 'shift' && guard < 10; guard++) {
    loadEverywhere(run);
    run.runShift();
  }

  // Shop: a Fixture in every bay, rerolling for more.
  for (let guard = 0; run.phase === 'shop' && guard < 40 && freeFixtureSlot(run) >= 0; guard++) {
    run.offers.forEach((offer, i) => {
      const slot = freeFixtureSlot(run);
      if (offer?.kind === 'fixture' && slot >= 0 && run.whyCannotBuy(i, { slot }) === null) run.buy(i, { slot });
    });
    if (run.whyCannotReroll() === null) run.reroll();
  }
  notes.push(`${run.line.filter((s) => s.fixture !== null).length} of ${run.line.length} bays have a Fixture`);
  if (run.whyCannotContinue() === null) run.continueToNextRound();

  // The Board round: Shift 1 parks its Designs, then Shift 2 loads fresh cards beside them.
  loadEverywhere(run);
  if (run.whyCannotRun() === null) run.runShift();
  loadEverywhere(run);
  notes.push(`round ${run.round}, Shift ${run.shift}, phase ${run.phase}`);
  return { run, notes };
}

/**
 * A finished run for the run summary: `won` plays every round against $1 targets; otherwise the
 * Y1 Board's target is out of reach, so the run ends there (and the summary shows the Board).
 */
export function buildQaEnding(won: boolean): QaScene {
  const targets = DEFAULT_CONFIG.targets.map((t, i) => (won || i < 2 ? 1 : t * 1000));
  const run = new ThroughputRun(7, { ...DEFAULT_CONFIG, startingCapital: 60, targets });
  for (let guard = 0; (run.phase === 'shift' || run.phase === 'shop') && guard < 200; guard++) {
    if (run.phase === 'shift') {
      loadEverywhere(run);
      if (run.whyCannotRun() !== null) break;
      run.runShift();
    } else {
      run.offers.forEach((offer, i) => {
        const slot = freeFixtureSlot(run);
        if (offer?.kind === 'fixture' && slot >= 0 && run.whyCannotBuy(i, { slot }) === null) run.buy(i, { slot });
      });
      if (run.whyCannotContinue() !== null) break;
      run.continueToNextRound();
    }
  }
  return { run, notes: [`seed 7, ${run.phase} after round ${run.round} of ${run.rounds}`] };
}

function freeFixtureSlot(run: ThroughputRun): number {
  return run.line.findIndex((s) => s.fixture === null);
}

const PLAN = ['design', 'make', 'make', 'ship', 'ship', 'ship', 'ship'] as const;

/** Loads hand cards into every bay that takes one, following PLAN (a Design, Makes, then Ships) so the Batch sells. */
function loadEverywhere(run: ThroughputRun): void {
  let step = 0;
  for (let slot = 0; slot < run.line.length; slot++) {
    const want = PLAN[Math.min(step, PLAN.length - 1)];
    const fits = (hand: number) => run.whyCannotLoad([{ hand, slot }]) === null;
    const preferred = run.hand.findIndex((card, hand) => card.def.stage === want && fits(hand));
    const hand = preferred >= 0 ? preferred : run.hand.findIndex((_, h) => fits(h));
    if (hand >= 0) {
      run.load([{ hand, slot }]);
      step++;
    }
  }
}
