// PLACEHOLDER bots for the demo scenario; they show the Bot contract, not real strategy.
import type { Rng } from '../../engine/rng';
import type { Run } from '../../engine/run';
import { Bot } from '../bots';
import type { PlayDecision, ShopDecision } from '../bots';
import type { DemoCard } from './demo-content';

const byValueDesc = (cards: readonly DemoCard[]): DemoCard[] => [...cards].sort((a, b) => b.value - a.value);

/** Plays its highest cards, discards low cards while it can. */
function greedyTurn(run: Run<DemoCard>): PlayDecision<DemoCard> {
  const max = run.config.maxSelection;
  const sorted = byValueDesc(run.deck.hand);
  const low = sorted.filter((c) => c.value <= 4).slice(-max);
  if (run.discardsLeft > 0 && low.length >= 3 && run.deck.drawPile.length > 0) return { action: 'discard', cards: low };
  return { action: 'play', cards: sorted.slice(0, max) };
}

/** Buys the first offer it can afford, then leaves. */
export class GreedyBot extends Bot<DemoCard> {
  readonly name = 'greedy';

  override playTurn(run: Run<DemoCard>): PlayDecision<DemoCard> {
    return greedyTurn(run);
  }

  override shopTurn(run: Run<DemoCard>): ShopDecision<DemoCard> {
    const slot = run.shop.offers.findIndex((_, i) => run.whyCannotBuy(i) === null);
    return slot >= 0 ? { action: 'buy', slot } : { action: 'leave' };
  }
}

/** Plays like greedy but only spends cash above an interest-earning reserve. */
export class HoarderBot extends Bot<DemoCard> {
  readonly name = 'hoarder';
  private readonly reserve: number;

  constructor(reserve = 25) {
    super();
    this.reserve = reserve;
  }

  override playTurn(run: Run<DemoCard>): PlayDecision<DemoCard> {
    return greedyTurn(run);
  }

  override shopTurn(run: Run<DemoCard>): ShopDecision<DemoCard> {
    const slot = run.shop.offers.findIndex(
      (offer, i) => offer !== null && run.wallet.cash - offer.price >= this.reserve && run.whyCannotBuy(i) === null,
    );
    return slot >= 0 ? { action: 'buy', slot } : { action: 'leave' };
  }
}

/** Uniformly random legal moves; a baseline floor. */
export class RandomBot extends Bot<DemoCard> {
  readonly name = 'random';
  private rng: Rng | null = null;

  override beginRun(_run: Run<DemoCard>, rng: Rng): void {
    this.rng = rng;
  }

  override playTurn(run: Run<DemoCard>): PlayDecision<DemoCard> {
    const rng = this.requireRng();
    const count = rng.int(1, Math.min(run.config.maxSelection, run.deck.hand.length));
    const cards = rng.shuffle(run.deck.hand).slice(0, count);
    const discard = run.discardsLeft > 0 && rng.next() < 0.3;
    return { action: discard ? 'discard' : 'play', cards };
  }

  override shopTurn(run: Run<DemoCard>): ShopDecision<DemoCard> {
    const rng = this.requireRng();
    const buyable = run.shop.offers.map((_, i) => i).filter((i) => run.whyCannotBuy(i) === null);
    if (buyable.length > 0 && rng.next() < 0.7) return { action: 'buy', slot: rng.pick(buyable) };
    return { action: 'leave' };
  }

  private requireRng(): Rng {
    if (this.rng === null) throw new Error('RandomBot: beginRun was not called');
    return this.rng;
  }
}
