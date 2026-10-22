import type { PayoutLine } from '../../engine/economy';
import type { Run, RunPhase } from '../../engine/run';
import { legalActions } from '../actions';
import type { Renderer } from '../render';

/** Plain-data snapshot of a run for display; every field is JSON-safe and card-type free. */
export type StateView = {
  readonly game: string;
  readonly seed: number;
  readonly actionsTaken: number;
  readonly phase: RunPhase;
  readonly round: {
    readonly number: number;
    readonly of: number;
    readonly target: number;
    readonly score: number;
    readonly isBoss: boolean;
    readonly boss: string | null;
  };
  /** The upcoming round while in the shop (target includes any boss adjustment), else null. */
  readonly next: {
    readonly number: number;
    readonly target: number;
    readonly isBoss: boolean;
    readonly boss: string | null;
  } | null;
  readonly plays: number;
  readonly discards: number;
  readonly cash: number;
  readonly handSize: number;
  readonly drawPile: number;
  readonly discardPile: number;
  /** Hand in position order (1-based positions are what play/discard take); empty outside a round. */
  readonly hand: readonly { readonly position: number; readonly card: string }[];
  readonly modifiers: readonly { readonly position: number; readonly name: string; readonly text: string; readonly sellValue: number }[];
  readonly modifierSlots: number;
  /** Present only in the shop. */
  readonly shop: {
    readonly rerollCost: number;
    readonly offers: readonly {
      readonly slot: number;
      readonly kind: string;
      readonly text: string;
      readonly price: number;
      /** Why it cannot be bought right now, or null. */
      readonly problem: string | null;
    }[];
  } | null;
  /** Payout of the round just cleared (roundEnd/won/shop), else null. */
  readonly payout: readonly PayoutLine[] | null;
  readonly legalActions: readonly string[];
};

export type ViewContext = {
  readonly game: string;
  readonly seed: number;
  readonly actionsTaken: number;
};

export function buildView<TCard>(run: Run<TCard>, renderer: Renderer<TCard>, context: ViewContext): StateView {
  const inShop = run.phase === 'shop';
  const showPayout = run.phase === 'roundEnd' || run.phase === 'won' || inShop;
  const next = run.peekNextRound();
  return {
    ...context,
    phase: run.phase,
    round: {
      number: run.round.number,
      of: run.config.rounds,
      target: run.round.target,
      score: run.roundScore,
      isBoss: run.round.isBoss,
      boss: run.boss === null ? null : renderer.boss(run.boss),
    },
    next:
      next === null
        ? null
        : {
            number: next.info.number,
            target: next.info.target,
            isBoss: next.info.isBoss,
            boss: next.boss === null ? null : renderer.boss(next.boss),
          },
    plays: run.playsLeft,
    discards: run.discardsLeft,
    cash: run.wallet.cash,
    handSize: run.deck.handSize,
    drawPile: run.deck.drawPile.length,
    discardPile: run.deck.discardPile.length,
    hand: (run.phase === 'playing' ? run.deck.hand : []).map((card, i) => ({ position: i + 1, card: renderer.card(card) })),
    modifiers: run.modifiers.modifiers.map((m, i) => ({
      position: i + 1,
      name: m.name,
      text: renderer.modifier(m),
      sellValue: run.shop.sellValue(m.price),
    })),
    modifierSlots: run.modifiers.capacity,
    shop: inShop
      ? {
          rerollCost: run.shop.rerollCost,
          offers: run.shop.offers.flatMap((offer, i) =>
            offer === null
              ? []
              : [
                  {
                    slot: i + 1,
                    kind: offer.def.kind,
                    text: offer.def.kind === 'card' ? renderer.cardDef(offer.def) : renderer.modifierDef(offer.def),
                    price: offer.price,
                    problem: run.whyCannotBuy(i),
                  },
                ],
          ),
        }
      : null,
    payout: showPayout ? (run.payout?.lines ?? null) : null,
    legalActions: legalActions(run, renderer),
  };
}
