import { EngineError } from '../errors';
import type { Rng } from '../rng';

export type DeckOptions = {
  /** Maximum cards held in hand. */
  handSize: number;
  /** When true, drawing from an empty draw pile first reshuffles the discard pile into it. */
  autoReshuffle?: boolean;
};

/**
 * Pile management for a deck of cards of any type.
 *
 * Piles: draw, hand, discard, exhaust. Exhausted cards are out for the current round only and
 * return on `resetForRound`; `remove` takes a card out of the deck permanently.
 * Cards are matched by identity (`===`), so object cards are tracked individually and equal
 * primitive cards are interchangeable.
 */
export class Deck<C> {
  private draw_: C[];
  private hand_: C[] = [];
  private discard_: C[] = [];
  private exhaust_: C[] = [];
  private handSize_: number;
  private readonly autoReshuffle: boolean;
  private readonly rng: Rng;

  constructor(cards: readonly C[], rng: Rng, options: DeckOptions) {
    this.rng = rng;
    this.handSize_ = Deck.validHandSize(options.handSize);
    this.autoReshuffle = options.autoReshuffle ?? false;
    this.draw_ = rng.shuffle(cards);
  }

  get drawPile(): readonly C[] {
    return this.draw_;
  }

  get hand(): readonly C[] {
    return this.hand_;
  }

  get discardPile(): readonly C[] {
    return this.discard_;
  }

  get exhaustPile(): readonly C[] {
    return this.exhaust_;
  }

  /** Every card in the deck regardless of pile. */
  get allCards(): readonly C[] {
    return [...this.draw_, ...this.hand_, ...this.discard_, ...this.exhaust_];
  }

  get handSize(): number {
    return this.handSize_;
  }

  set handSize(size: number) {
    this.handSize_ = Deck.validHandSize(size);
  }

  /**
   * Draws up to `n` cards from the top of the draw pile, never exceeding the hand size.
   * Returns the cards drawn (possibly fewer than `n`).
   */
  draw(n: number): C[] {
    const drawn: C[] = [];
    let wanted = Math.min(n, this.handSize_ - this.hand_.length);
    while (wanted > 0) {
      if (this.draw_.length === 0) {
        if (!this.autoReshuffle || this.discard_.length === 0) break;
        this.reshuffleDiscardIntoDraw();
      }
      const card = this.draw_.pop() as C;
      this.hand_.push(card);
      drawn.push(card);
      wanted--;
    }
    return drawn;
  }

  /** Draws until the hand is full or no cards remain. */
  fillHand(): C[] {
    return this.draw(this.handSize_ - this.hand_.length);
  }

  /** Moves the given hand cards to the discard pile. */
  discard(cards: readonly C[]): void {
    this.takeFromHand(cards);
    this.discard_.push(...cards);
  }

  /** Moves the given hand cards to the exhaust pile (out until the next round reset). */
  exhaust(cards: readonly C[]): void {
    this.takeFromHand(cards);
    this.exhaust_.push(...cards);
  }

  /** True if every given card is in hand (respecting multiplicity). */
  inHand(cards: readonly C[]): boolean {
    const remaining = [...this.hand_];
    for (const card of cards) {
      const i = remaining.indexOf(card);
      if (i < 0) return false;
      remaining.splice(i, 1);
    }
    return true;
  }

  /** Shuffles the discard pile under the current draw pile. */
  reshuffleDiscardIntoDraw(): void {
    this.draw_ = [...this.rng.shuffle(this.discard_), ...this.draw_];
    this.discard_ = [];
  }

  /** Returns every card (including exhausted ones) to the draw pile and shuffles it. */
  resetForRound(): void {
    this.draw_ = this.rng.shuffle(this.allCards);
    this.hand_ = [];
    this.discard_ = [];
    this.exhaust_ = [];
  }

  /** Permanently adds a card to the deck, shuffled into the draw pile. */
  add(card: C): void {
    const at = this.rng.int(0, this.draw_.length);
    this.draw_.splice(at, 0, card);
  }

  /** Permanently removes a card from whichever pile holds it. */
  remove(card: C): void {
    for (const pile of [this.draw_, this.hand_, this.discard_, this.exhaust_]) {
      const i = pile.indexOf(card);
      if (i >= 0) {
        pile.splice(i, 1);
        return;
      }
    }
    throw new EngineError('Deck.remove: card is not in the deck');
  }

  private takeFromHand(cards: readonly C[]): void {
    if (!this.inHand(cards)) throw new EngineError('Deck: card is not in hand');
    for (const card of cards) {
      this.hand_.splice(this.hand_.indexOf(card), 1);
    }
  }

  private static validHandSize(size: number): number {
    if (!Number.isInteger(size) || size < 0) throw new EngineError(`Deck: invalid hand size ${size}`);
    return size;
  }
}
