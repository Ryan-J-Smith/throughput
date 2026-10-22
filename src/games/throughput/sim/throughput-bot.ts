import type { Rng } from '../../../engine/rng';
import type { BuyTarget, Placement, ThroughputRun } from '../rules';

export type ShiftDecision =
  | { readonly kind: 'load'; readonly placements: readonly Placement[] }
  | { readonly kind: 'retool'; readonly hand: readonly number[] }
  | { readonly kind: 'scrap'; readonly slots: readonly number[] }
  | { readonly kind: 'run' };

export type ShopDecision =
  | { readonly kind: 'buy'; readonly offer: number; readonly target: BuyTarget }
  | { readonly kind: 'sellFixture'; readonly slot: number }
  | { readonly kind: 'sellCard'; readonly deckCard: number }
  | { readonly kind: 'move'; readonly from: number; readonly to: number }
  | { readonly kind: 'reroll' }
  | { readonly kind: 'leave' };

/**
 * A THROUGHPUT strategy for headless simulation. The scenario calls `shiftTurn` until it returns
 * `run`, and `shopTurn` until it returns `leave`. Decisions must be legal (check the run's
 * `whyCannot…` queries); an illegal one aborts the simulation.
 */
export abstract class ThroughputBot {
  abstract readonly name: string;

  /** Called once per run; `rng` is a per-seed stream reserved for the bot. */
  beginRun(_run: ThroughputRun, _rng: Rng): void {}

  abstract shiftTurn(run: ThroughputRun): ShiftDecision;

  abstract shopTurn(run: ThroughputRun): ShopDecision;

  /** Strategy label for the finished run (what it ended up building). */
  abstract archetypeOf(run: ThroughputRun): string;
}
