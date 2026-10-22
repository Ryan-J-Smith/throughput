import { Deck } from '../deck';
import { computeInterest, Payout, Wallet } from '../economy';
import { EngineError } from '../errors';
import { ModifierBus } from '../modifiers';
import type { EngineEvent, Modifier } from '../modifiers';
import { ScoreContext } from '../scoring';
import { Shop } from '../shop';
import type { ShopOffer } from '../shop';
import type { RoundInfo, RunConfig, RunDeps, RunPhase, RunShopDef } from './run-config';

export type PlayResult = {
  readonly score: ScoreContext;
  readonly total: number;
};

/**
 * One run: the phase state machine tying deck, modifiers, scoring, economy and shop together.
 *
 * Actions throw EngineError when not allowed; each has a `whyCannot…` query returning the
 * reason (or null) so a UI can disable controls without try/catch.
 * `playsLeft` and `discardsLeft` are public so modifiers can grant or remove them.
 */
export class Run<TCard> {
  readonly config: RunConfig<TCard>;
  readonly deck: Deck<TCard>;
  readonly modifiers: ModifierBus<TCard>;
  readonly wallet: Wallet;
  readonly shop: Shop<RunShopDef<TCard>>;
  playsLeft = 0;
  discardsLeft = 0;

  private readonly deps: RunDeps<TCard>;
  private phase_: RunPhase = 'setup';
  private round_: RoundInfo;
  private roundScore_ = 0;
  private payout_: Payout | null = null;

  constructor(config: RunConfig<TCard>, deps: RunDeps<TCard>) {
    if (!Number.isInteger(config.rounds) || config.rounds < 1) {
      throw new EngineError(`Run: invalid round count ${config.rounds}`);
    }
    this.config = config;
    this.deps = deps;
    this.deck = new Deck(config.startingDeck, deps.rng.fork('deck'), { handSize: config.handSize });
    this.modifiers = new ModifierBus(config.modifierSlots);
    this.wallet = new Wallet(config.startingCash);
    this.shop = new Shop(config.shop, deps.rng.fork('shop'));
    this.round_ = this.makeRound(1);
  }

  get phase(): RunPhase {
    return this.phase_;
  }

  get round(): RoundInfo {
    return this.round_;
  }

  /** Score accumulated so far this round. */
  get roundScore(): number {
    return this.roundScore_;
  }

  /** Payout from the most recently cleared round, or null if none yet. */
  get payout(): Payout | null {
    return this.payout_;
  }

  // ---- lifecycle ----

  start(): void {
    this.requirePhase('setup');
    this.phase_ = 'roundStart';
    this.emit({ type: 'runStart', run: this });
  }

  /** Resets the deck and per-round counters, notifies modifiers, then deals the hand. */
  startRound(): void {
    this.requirePhase('roundStart');
    this.phase_ = 'playing';
    this.roundScore_ = 0;
    this.playsLeft = this.config.playsPerRound;
    this.discardsLeft = this.config.discardsPerRound;
    this.deck.resetForRound();
    this.emit({ type: 'roundStart', run: this, round: this.round_ });
    this.deck.fillHand();
    this.loseIfStuck();
  }

  enterShop(): void {
    this.requirePhase('roundEnd');
    this.phase_ = 'shop';
    this.shop.restock(this.shopFilter());
    this.emit({ type: 'shopEnter', run: this });
  }

  leaveShop(): void {
    this.requirePhase('shop');
    this.round_ = this.makeRound(this.round_.number + 1);
    this.phase_ = 'roundStart';
  }

  // ---- playing ----

  whyCannotPlay(cards: readonly TCard[]): string | null {
    if (this.phase_ !== 'playing') return 'Not in a round';
    if (this.playsLeft <= 0) return 'No plays left';
    return this.selectionProblem(cards);
  }

  /** Scores the selected hand cards, discards them, and resolves the round if it is decided. */
  play(cards: readonly TCard[]): PlayResult {
    this.check(this.whyCannotPlay(cards));
    this.playsLeft--;
    const held = without(this.deck.hand, cards);
    const score = new ScoreContext(this.deps.formula);
    const scoring = this.deps.evaluator.evaluate(cards, held, score);
    this.emit({ type: 'beforeScore', run: this, played: cards, scoring, score });
    scoring.forEach((card, index) => {
      this.deps.evaluator.scoreCard(card, score);
      this.emit({ type: 'scoreStep', run: this, card, index, score });
    });
    const total = score.total();
    this.roundScore_ += total;
    this.deck.discard(cards);
    this.emit({ type: 'afterPlay', run: this, played: cards, score, total });

    if (this.roundScore_ >= this.round_.target) {
      this.winRound();
    } else if (this.playsLeft <= 0) {
      this.loseRound();
    } else {
      this.deck.fillHand();
      this.loseIfStuck();
    }
    return { score, total };
  }

  whyCannotDiscard(cards: readonly TCard[]): string | null {
    if (this.phase_ !== 'playing') return 'Not in a round';
    if (this.discardsLeft <= 0) return 'No discards left';
    return this.selectionProblem(cards);
  }

  discard(cards: readonly TCard[]): void {
    this.check(this.whyCannotDiscard(cards));
    this.discardsLeft--;
    this.deck.discard(cards);
    this.emit({ type: 'discard', run: this, discarded: cards });
    this.deck.fillHand();
    this.loseIfStuck();
  }

  // ---- shop ----

  whyCannotBuy(slot: number): string | null {
    if (this.phase_ !== 'shop') return 'Shop is closed';
    const offer = this.shop.offers[slot];
    if (offer != null && offer.def.kind === 'modifier' && this.modifiers.isFull) return 'No free modifier slot';
    return this.shop.whyCannotBuy(slot, this.wallet);
  }

  /** Buys the offer in `slot`: cards join the deck, modifiers take the rightmost free slot. */
  buy(slot: number): ShopOffer<RunShopDef<TCard>> {
    this.check(this.whyCannotBuy(slot));
    const offer = this.shop.buy(slot, this.wallet);
    if (offer.def.kind === 'card') {
      this.deck.add(offer.def.create());
    } else {
      this.modifiers.add(offer.def.create());
    }
    this.emit({ type: 'purchase', run: this, offer });
    return offer;
  }

  whyCannotReroll(): string | null {
    if (this.phase_ !== 'shop') return 'Shop is closed';
    return this.shop.whyCannotReroll(this.wallet);
  }

  reroll(): void {
    this.check(this.whyCannotReroll());
    this.shop.reroll(this.wallet, this.shopFilter());
  }

  whyCannotSell(modifier: Modifier<TCard>): string | null {
    if (this.phase_ === 'setup' || this.phase_ === 'won' || this.phase_ === 'lost') return 'Run is not active';
    if (!this.modifiers.modifiers.includes(modifier)) return 'Modifier is not owned';
    return null;
  }

  /** Sells an owned modifier. The sell event fires before removal so the sold modifier sees it too. */
  sell(modifier: Modifier<TCard>): number {
    this.check(this.whyCannotSell(modifier));
    const value = this.shop.sellValue(modifier.price);
    this.emit({ type: 'sell', run: this, modifier, value });
    this.modifiers.remove(modifier);
    this.wallet.earn(value);
    return value;
  }

  // ---- internals ----

  private winRound(): void {
    const { number, isBoss } = this.round_;
    const payout = new Payout();
    const lines: [string, number][] = [
      ['Round reward', this.config.roundReward(number, isBoss)],
      ['Unused plays', this.playsLeft * this.config.cashPerUnusedPlay],
      ['Unused discards', this.discardsLeft * this.config.cashPerUnusedDiscard],
      ['Interest', computeInterest(this.wallet.cash, this.config.interest)],
    ];
    for (const [source, amount] of lines) {
      if (amount !== 0) payout.add(source, amount);
    }
    this.emit({ type: 'roundEnd', run: this, round: this.round_, won: true, roundScore: this.roundScore_, payout });
    this.wallet.earn(payout.total());
    this.payout_ = payout;
    this.phase_ = number >= this.config.rounds ? 'won' : 'roundEnd';
  }

  private loseRound(): void {
    this.phase_ = 'lost';
    this.emit({
      type: 'roundEnd',
      run: this,
      round: this.round_,
      won: false,
      roundScore: this.roundScore_,
      payout: new Payout(),
    });
  }

  /** With no cards to play, the round cannot be won. */
  private loseIfStuck(): void {
    if (this.phase_ === 'playing' && this.deck.hand.length === 0) this.loseRound();
  }

  private makeRound(number: number): RoundInfo {
    const isBoss = this.config.bossEvery > 0 && number % this.config.bossEvery === 0;
    return { number, isBoss, target: this.config.target(number, isBoss) };
  }

  /** Hides modifiers the player already owns. */
  private shopFilter(): (def: RunShopDef<TCard>) => boolean {
    const owned = new Set(this.modifiers.modifiers.map((m) => m.id));
    return (def) => def.kind !== 'modifier' || !owned.has(def.id);
  }

  private selectionProblem(cards: readonly TCard[]): string | null {
    if (cards.length === 0) return 'Select at least one card';
    if (cards.length > this.config.maxSelection) return `Select at most ${this.config.maxSelection} cards`;
    if (!this.deck.inHand(cards)) return 'Selected cards are not in hand';
    return null;
  }

  private requirePhase(phase: RunPhase): void {
    if (this.phase_ !== phase) throw new EngineError(`Run: expected phase ${phase}, was ${this.phase_}`);
  }

  private check(reason: string | null): void {
    if (reason !== null) throw new EngineError(reason);
  }

  private emit(event: EngineEvent<TCard>): void {
    this.modifiers.emit(event);
  }
}

/** `items` minus one occurrence of each of `remove`. */
function without<T>(items: readonly T[], remove: readonly T[]): T[] {
  const out = [...items];
  for (const item of remove) {
    const i = out.indexOf(item);
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}
