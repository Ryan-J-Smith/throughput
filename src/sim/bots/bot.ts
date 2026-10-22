import type { Modifier } from '../../engine/modifiers';
import type { Rng } from '../../engine/rng';
import type { Run } from '../../engine/run';

export type PlayDecision<TCard> = {
  readonly action: 'play' | 'discard';
  readonly cards: readonly TCard[];
};

export type ShopDecision<TCard> =
  | { readonly action: 'buy'; readonly slot: number }
  | { readonly action: 'sell'; readonly modifier: Modifier<TCard> }
  | { readonly action: 'reroll' }
  | { readonly action: 'leave' };

/**
 * A playing strategy for headless simulation. The harness calls `playTurn` repeatedly while a
 * round is in progress and `shopTurn` repeatedly in the shop until it returns `leave`.
 * Decisions must be legal (check the run's `whyCannot…` queries); illegal ones abort the simulation.
 */
export abstract class Bot<TCard> {
  abstract readonly name: string;

  /** Called once per run before it starts; `rng` is a per-seed stream reserved for the bot. */
  beginRun(_run: Run<TCard>, _rng: Rng): void {}

  abstract playTurn(run: Run<TCard>): PlayDecision<TCard>;

  abstract shopTurn(run: Run<TCard>): ShopDecision<TCard>;
}
