import type { Rng } from '../../../engine/rng';
import type { Part, PartCategory } from '../model';
import type { BomRun, RndTarget } from '../rules';

export type BuildDecision =
  | { readonly action: 'ship'; readonly product: string; readonly parts: readonly Part[] }
  | { readonly action: 'fab'; readonly parts: readonly Part[]; readonly trash?: Part }
  | { readonly action: 'scrap'; readonly parts: readonly Part[] }
  /** Overtime only: end the round, taking $1 per unused Build. */
  | { readonly action: 'collect' };

export type BomShopDecision =
  | { readonly action: 'buy'; readonly slot: number; readonly target?: RndTarget }
  | { readonly action: 'sell'; readonly id: string }
  | { readonly action: 'shred'; readonly category: PartCategory; readonly grade: number }
  | { readonly action: 'reroll' }
  | { readonly action: 'leave' };

/** A Bill of Materials strategy for headless simulation. Decisions must be legal. */
export abstract class BomBot {
  abstract readonly name: string;

  /** Called before each run; `rng` is a per-seed stream reserved for the bot. */
  beginRun(_run: BomRun, _rng: Rng): void {}

  /** One decision while the round (or Overtime) is in progress. */
  abstract buildTurn(run: BomRun): BuildDecision;

  /** One decision in the shop; called until it returns leave. */
  abstract shopTurn(run: BomRun): BomShopDecision;

  /** Strategy label for the finished run (see the sim's archetype reports). Default: the bot name. */
  archetypeOf(_run: BomRun): string {
    return this.name;
  }
}
