import type { ScoreContext } from '../scoring';

/**
 * Design-specific rules for what a play is worth. The run calls `evaluate` once per play,
 * then `scoreCard` for each scoring card in order, emitting modifier events in between.
 */
export abstract class PlayEvaluator<TCard> {
  /**
   * Seeds `score` for the played cards (e.g. the hand type's base values) and returns the
   * played cards that score, in scoring order. `held` is the rest of the hand.
   */
  abstract evaluate(played: readonly TCard[], held: readonly TCard[], score: ScoreContext): readonly TCard[];

  /** Applies a single scoring card's own contribution. */
  abstract scoreCard(card: TCard, score: ScoreContext): void;
}
