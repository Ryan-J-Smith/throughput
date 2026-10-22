import type { CardDef } from '../deck';
import type { InterestConfig } from '../economy';
import type { ModifierDef } from '../modifiers';
import type { Rng } from '../rng';
import type { ScoreFormula } from '../scoring';
import type { ShopConfig } from '../shop';
import type { PlayEvaluator } from './play-evaluator';

/**
 * Lifecycle: setup → roundStart → playing → roundEnd → shop → roundStart … ;
 * terminal phases are won (final round cleared) and lost (a target missed).
 */
export type RunPhase = 'setup' | 'roundStart' | 'playing' | 'roundEnd' | 'shop' | 'won' | 'lost';

export type RoundInfo = {
  /** 1-based round number. */
  readonly number: number;
  readonly isBoss: boolean;
  /** Score needed to clear the round. */
  readonly target: number;
};

/** Anything the run's shop can sell. */
export type RunShopDef<TCard> = CardDef<TCard> | ModifierDef<TCard>;

export type RunConfig<TCard> = {
  /** Clearing this many rounds wins the run. */
  readonly rounds: number;
  /** Every `bossEvery`-th round is a boss round; 0 disables bosses. */
  readonly bossEvery: number;
  /** Score target for a round. */
  readonly target: (round: number, isBoss: boolean) => number;
  readonly playsPerRound: number;
  readonly discardsPerRound: number;
  readonly handSize: number;
  /** Maximum cards selected for a single play or discard. */
  readonly maxSelection: number;
  readonly modifierSlots: number;
  readonly startingDeck: readonly TCard[];
  readonly startingCash: number;
  /** Base cash for clearing a round. */
  readonly roundReward: (round: number, isBoss: boolean) => number;
  readonly cashPerUnusedPlay: number;
  readonly cashPerUnusedDiscard: number;
  readonly interest: InterestConfig;
  readonly shop: ShopConfig<RunShopDef<TCard>>;
};

/** Collaborators injected into a run. */
export type RunDeps<TCard> = {
  /** Root stream; the run forks independent substreams from it. */
  readonly rng: Rng;
  readonly evaluator: PlayEvaluator<TCard>;
  readonly formula: ScoreFormula;
};
