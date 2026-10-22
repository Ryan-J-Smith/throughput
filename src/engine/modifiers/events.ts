import type { Payout } from '../economy';
import type { RoundInfo, Run, RunShopDef } from '../run';
import type { ScoreContext } from '../scoring';
import type { ShopOffer } from '../shop';
import type { Modifier } from './modifier';

/** Every event the engine broadcasts to modifiers, discriminated by `type`. */
export type EngineEvent<TCard> =
  | { readonly type: 'runStart'; readonly run: Run<TCard> }
  | { readonly type: 'roundStart'; readonly run: Run<TCard>; readonly round: RoundInfo }
  | {
      readonly type: 'beforeScore';
      readonly run: Run<TCard>;
      readonly played: readonly TCard[];
      /** The subset of played cards that score, in scoring order. */
      readonly scoring: readonly TCard[];
      readonly score: ScoreContext;
    }
  | {
      readonly type: 'scoreStep';
      readonly run: Run<TCard>;
      readonly card: TCard;
      /** Position of `card` within the scoring cards. */
      readonly index: number;
      readonly score: ScoreContext;
    }
  | {
      readonly type: 'afterPlay';
      readonly run: Run<TCard>;
      readonly played: readonly TCard[];
      readonly score: ScoreContext;
      /** This play's final total. */
      readonly total: number;
    }
  | { readonly type: 'discard'; readonly run: Run<TCard>; readonly discarded: readonly TCard[] }
  | {
      readonly type: 'roundEnd';
      readonly run: Run<TCard>;
      readonly round: RoundInfo;
      readonly won: boolean;
      readonly roundScore: number;
      /** Cash reward for the round; modifiers may add lines. Empty and unpaid when lost. */
      readonly payout: Payout;
    }
  | { readonly type: 'shopEnter'; readonly run: Run<TCard> }
  | { readonly type: 'purchase'; readonly run: Run<TCard>; readonly offer: ShopOffer<RunShopDef<TCard>> }
  | { readonly type: 'sell'; readonly run: Run<TCard>; readonly modifier: Modifier<TCard>; readonly value: number };

export type EngineEventType = EngineEvent<unknown>['type'];
