import { Payout, Wallet, computeInterest } from '../../../engine/economy';
import type { PayoutLine } from '../../../engine/economy';
import { Rng } from '../../../engine/rng';
import { BOSSES, DEFAULT_CONFIG, STARTER_CARDS } from '../content';
import type { ThroughputConfig } from '../content';
import { CATEGORIES, cardName } from '../model';
import type { BoardBoss, Card, CardDef, Category, Fixture, FixtureDef } from '../model';
import { trendSchedule } from './market';
import { scoreLine } from './score-line';
import type { LineSlot, ShiftResult, Trends } from './score-line';
import { ThroughputShop } from './throughput-shop';
import type { Offer } from './throughput-shop';

export type Phase = 'shift' | 'shop' | 'won' | 'lost';

/** A card on the Line and the Shift it was loaded in. */
export type LineCard = { readonly card: Card; readonly loadedShift: number };

export type LineState = {
  readonly fixture: Fixture | null;
  readonly card: LineCard | null;
};

export type QuarterInfo = {
  readonly round: number;
  readonly year: number;
  /** 1 or 2 for Q1/Q2, 3 for the Board Review. */
  readonly quarter: number;
  readonly isBoard: boolean;
};

export type RoundRecord = {
  readonly round: number;
  readonly isBoard: boolean;
  readonly target: number;
  readonly sales: number;
  readonly won: boolean;
  readonly shiftsUsed: number;
  /** Capital after the round's payout. */
  readonly capital: number;
};

/** A load instruction: hand index → slot index, both 0-based. */
export type Placement = { readonly hand: number; readonly slot: number };

/** What `buy` acts on: a Line slot for a Fixture, a deck card for a targeted Contract. */
export type BuyTarget = { readonly slot?: number; readonly deckCard?: number };

type SlotState = { fixture: Fixture | null; card: LineCard | null };

/**
 * A THROUGHPUT run: 12 rounds of up to 4 Shifts each, with a shop between rounds. A game-specific
 * state machine rather than engine Run, because a round is "load cards into Line slots, then run
 * the Batch", and Designs stay on the Line between Shifts.
 *
 * Every action has a `whyCannot…` query; the action itself throws if called anyway, and a
 * refused action never changes state.
 */
export class ThroughputRun {
  readonly config: ThroughputConfig;
  readonly seed: number;
  readonly wallet: Wallet;
  /** Market trends for every round, fixed at the start. */
  readonly trends: readonly Trends[];
  /** One boss per Year's Board Review, in Year order. */
  readonly boardBosses: readonly BoardBoss[];
  private readonly deckRng: Rng;
  private readonly shop_: ThroughputShop;
  private readonly slots_: SlotState[];
  private readonly equity_: Record<Category, number>;
  private readonly history_: RoundRecord[] = [];
  private phase_: Phase = 'shift';
  private round_ = 1;
  private shift_ = 1;
  private sales_ = 0;
  private retools_ = 0;
  private hotPips_ = 0;
  private stored_ = 0;
  private deck_: Card[] = [];
  private draw_: Card[] = [];
  private hand_: Card[] = [];
  private discard_: Card[] = [];
  /** Fixtures as the player arranged them, restored after a round (Line Shift moves them). */
  private layout: (Fixture | null)[] = [];
  private lastShift_: ShiftResult | null = null;
  private lastPayout_: readonly PayoutLine[] | null = null;
  private storageNotice_: string | null = null;
  private nextUid = 1;

  constructor(seed: number, config: ThroughputConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.seed = seed;
    const rng = new Rng(seed);
    this.deckRng = rng.fork('deck');
    this.trends = trendSchedule(config.targets.length, rng.fork('market'));
    const years = Math.ceil(config.targets.length / config.roundsPerYear);
    const order = rng.fork('bosses').shuffle(BOSSES);
    this.boardBosses = Array.from({ length: years }, (_, i) => order[i % order.length] as BoardBoss);
    this.shop_ = new ThroughputShop(config, rng.fork('shop'));
    this.wallet = new Wallet(config.startingCapital);
    this.equity_ = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    this.slots_ = Array.from({ length: config.startSlots }, () => ({ fixture: null, card: null }));
    for (const category of CATEGORIES) {
      for (const def of STARTER_CARDS) this.deck_.push(this.newCard(def, category, 0));
    }
    this.startRound();
  }

  // ---- state ----

  get phase(): Phase {
    return this.phase_;
  }

  get round(): number {
    return this.round_;
  }

  get rounds(): number {
    return this.config.targets.length;
  }

  get quarter(): QuarterInfo {
    return this.quarterOf(this.round_);
  }

  get target(): number {
    return this.config.targets[this.round_ - 1] ?? 0;
  }

  /** The Shift being loaded (1-based). */
  get shift(): number {
    return this.shift_;
  }

  /** Sales so far this round. */
  get sales(): number {
    return this.sales_;
  }

  get retoolsLeft(): number {
    return this.retools_;
  }

  get hotPipsLeft(): number {
    return this.hotPips_;
  }

  get stored(): number {
    return this.stored_;
  }

  get equity(): Readonly<Record<Category, number>> {
    return this.equity_;
  }

  get trendsNow(): Trends {
    return this.trends[Math.min(this.round_, this.trends.length) - 1] as Trends;
  }

  /** The boss of the current round, if it is a Board Review. */
  get boss(): BoardBoss | null {
    return this.bossOf(this.round_);
  }

  get line(): readonly LineState[] {
    return this.slots_;
  }

  get hand(): readonly Card[] {
    return this.hand_;
  }

  get drawPile(): readonly Card[] {
    return this.draw_;
  }

  get discardPile(): readonly Card[] {
    return this.discard_;
  }

  /** Every card the player owns, in the order acquired (deck card numbers index this). */
  get deck(): readonly Card[] {
    return this.deck_;
  }

  get offers(): readonly (Offer | null)[] {
    return this.phase_ === 'shop' ? this.shop_.offers : [];
  }

  get rerollCost(): number {
    return this.shop_.rerollCost;
  }

  get lastShift(): ShiftResult | null {
    return this.lastShift_;
  }

  /** Payout of the round just cleared (in the shop or after the win), else null. */
  get lastPayout(): readonly PayoutLine[] | null {
    return this.lastPayout_;
  }

  /** What happened to stored Units on entering the shop, if anything. */
  get storageNotice(): string | null {
    return this.storageNotice_;
  }

  get history(): readonly RoundRecord[] {
    return this.history_;
  }

  quarterOf(round: number): QuarterInfo {
    const perYear = this.config.roundsPerYear;
    const quarter = ((round - 1) % perYear) + 1;
    return { round, year: Math.ceil(round / perYear), quarter, isBoard: quarter === perYear };
  }

  bossOf(round: number): BoardBoss | null {
    const info = this.quarterOf(round);
    return info.isBoard ? (this.boardBosses[info.year - 1] ?? null) : null;
  }

  /** The next `count` Board Reviews from the current round on (bosses are telegraphed a Year ahead). */
  upcomingBoards(count = 2): { readonly round: number; readonly year: number; readonly boss: BoardBoss }[] {
    const out: { round: number; year: number; boss: BoardBoss }[] = [];
    for (let round = this.round_; round <= this.rounds && out.length < count; round++) {
      const boss = this.bossOf(round);
      if (boss !== null) out.push({ round, year: this.quarterOf(round).year, boss });
    }
    return out;
  }

  /** What the Line would make if run now. */
  preview(): ShiftResult {
    return scoreLine(this.lineForScoring(), this.shiftContext());
  }

  isWelded(slot: number): boolean {
    return this.boss?.isWelded(slot) ?? false;
  }

  // ---- Shift actions ----

  whyCannotLoad(placements: readonly Placement[]): string | null {
    if (this.phase_ !== 'shift') return 'Not during a Shift';
    if (placements.length === 0) return 'Name at least one hand card and slot';
    const hands = new Set<number>();
    const slots = new Set<number>();
    for (const { hand, slot } of placements) {
      if (this.hand_[hand] === undefined) return `No hand card ${hand + 1}`;
      const target = this.slots_[slot];
      if (target === undefined) return `No slot ${slot + 1} (the Line has ${this.slots_.length})`;
      if (hands.has(hand)) return `Hand card ${hand + 1} is named twice`;
      if (slots.has(slot)) return `Slot ${slot + 1} is named twice`;
      if (this.isWelded(slot)) return `Slot ${slot + 1} is welded shut`;
      if (target.fixture?.def.kind === 'station') return `Slot ${slot + 1} holds a Station (${target.fixture.def.name}); it takes no card`;
      if (target.card !== null) return `Slot ${slot + 1} already holds ${cardName(target.card.card)}`;
      hands.add(hand);
      slots.add(slot);
    }
    return null;
  }

  load(placements: readonly Placement[]): void {
    this.assert(this.whyCannotLoad(placements));
    const moves = placements.map(({ hand, slot }) => ({ card: this.hand_[hand] as Card, slot }));
    for (const { card, slot } of moves) {
      this.hand_.splice(this.hand_.indexOf(card), 1);
      (this.slots_[slot] as SlotState).card = { card, loadedShift: this.shift_ };
    }
  }

  whyCannotUnload(slots: readonly number[]): string | null {
    if (this.phase_ !== 'shift') return 'Not during a Shift';
    if (slots.length === 0) return 'Name at least one slot';
    if (new Set(slots).size !== slots.length) return 'A slot is named twice';
    for (const slot of slots) {
      const held = this.slots_[slot]?.card;
      if (held == null) return `Slot ${slot + 1} has no card`;
      if (held.loadedShift !== this.shift_) return `${cardName(held.card)} in slot ${slot + 1} is parked from an earlier Shift; scrap it instead`;
    }
    return null;
  }

  /** Returns cards loaded this Shift to the hand. */
  unload(slots: readonly number[]): void {
    this.assert(this.whyCannotUnload(slots));
    for (const slot of slots) {
      const state = this.slots_[slot] as SlotState;
      this.hand_.push((state.card as LineCard).card);
      state.card = null;
    }
  }

  whyCannotScrap(slots: readonly number[]): string | null {
    if (this.phase_ !== 'shift') return 'Not during a Shift';
    if (slots.length === 0) return 'Name at least one slot';
    if (new Set(slots).size !== slots.length) return 'A slot is named twice';
    for (const slot of slots) {
      const held = this.slots_[slot]?.card;
      if (held == null) return `Slot ${slot + 1} has no card`;
      if (held.loadedShift === this.shift_) return `${cardName(held.card)} in slot ${slot + 1} was loaded this Shift; unload it instead`;
    }
    return null;
  }

  /** Discards cards parked on the Line from earlier Shifts, freeing their slots. */
  scrap(slots: readonly number[]): void {
    this.assert(this.whyCannotScrap(slots));
    for (const slot of slots) {
      const state = this.slots_[slot] as SlotState;
      this.discard_.push((state.card as LineCard).card);
      state.card = null;
    }
  }

  whyCannotRetool(hand: readonly number[]): string | null {
    if (this.phase_ !== 'shift') return 'Not during a Shift';
    if (this.retools_ <= 0) return 'No Retools left this round';
    if (hand.length === 0) return 'Name at least one hand card';
    if (hand.length > this.config.retoolMax) return `A Retool discards at most ${this.config.retoolMax} cards`;
    if (new Set(hand).size !== hand.length) return 'A hand card is named twice';
    const missing = hand.find((i) => this.hand_[i] === undefined);
    return missing === undefined ? null : `No hand card ${missing + 1}`;
  }

  /** Discards up to 3 hand cards and draws as many (fewer if the deck runs out). */
  retool(hand: readonly number[]): void {
    this.assert(this.whyCannotRetool(hand));
    const cards = hand.map((i) => this.hand_[i] as Card);
    this.hand_ = this.hand_.filter((card) => !cards.includes(card));
    this.discard_.push(...cards);
    this.retools_--;
    for (let i = 0; i < cards.length && this.draw_.length > 0; i++) this.hand_.push(this.draw_.pop() as Card);
  }

  whyCannotRun(): string | null {
    return this.phase_ === 'shift' ? null : 'Not during a Shift';
  }

  /** Runs the Batch, banks the sales, dispatches, and moves on (next Shift, shop, or the end). */
  runShift(): ShiftResult {
    this.assert(this.whyCannotRun());
    const result = this.preview();
    this.sales_ = Math.max(0, this.sales_ + result.total);
    for (const card of result.grown) card.growth++;
    if (result.hotPipUsed) this.hotPips_--;
    for (const category of result.equityGained) this.equity_[category]++;
    this.stored_ = result.storedAfter;
    this.dispatch();
    this.lastShift_ = result;

    if (this.sales_ >= this.target) this.clearRound();
    else if (this.shift_ >= this.config.shiftsPerRound) this.loseRound();
    else {
      this.shift_++;
      this.beginShift();
    }
    return result;
  }

  // ---- shop actions ----

  whyCannotBuy(offer: number, target: BuyTarget = {}): string | null {
    if (this.phase_ !== 'shop') return 'The shop is closed';
    const reason = this.shop_.whyCannotBuy(offer, this.wallet);
    if (reason !== null) return reason;
    const item = this.shop_.offers[offer] as Offer;
    if (item.kind === 'fixture') {
      if (target.slot === undefined) return `Say which slot gets the ${item.def.name} (buy ${offer + 1} <slot>)`;
      const slot = this.slots_[target.slot];
      if (slot === undefined) return `No slot ${target.slot + 1} (the Line has ${this.slots_.length})`;
      if (slot.fixture !== null) return `Slot ${target.slot + 1} already has ${slot.fixture.def.name}; sell or move it first`;
    }
    if (item.kind === 'contract') {
      if (item.def.effect === 'expand' && this.slots_.length >= this.config.maxSlots) return `The Line is already at ${this.config.maxSlots} slots`;
      if (item.def.targetsCard) {
        if (target.deckCard === undefined) return `Say which deck card (buy ${offer + 1} <deck card>)`;
        if (this.deck_[target.deckCard] === undefined) return `No deck card ${target.deckCard + 1}`;
        if (item.def.effect === 'downsize' && this.deck_.length <= 1) return 'Your deck needs at least one card';
      }
    }
    return null;
  }

  buy(offer: number, target: BuyTarget = {}): Offer {
    this.assert(this.whyCannotBuy(offer, target));
    const item = this.shop_.buy(offer, this.wallet);
    switch (item.kind) {
      case 'fixture':
        (this.slots_[target.slot as number] as SlotState).fixture = this.newFixture(item.def, item.price);
        break;
      case 'card':
        this.deck_.push(this.newCard(item.def, item.category, item.price));
        break;
      case 'contract':
        this.applyContract(item.def.effect, target.deckCard);
        break;
    }
    return item;
  }

  whyCannotSellFixture(slot: number): string | null {
    if (this.phase_ !== 'shop') return 'Sell in the shop';
    return this.slots_[slot]?.fixture == null ? `Slot ${slot + 1} has no Fixture` : null;
  }

  sellFixture(slot: number): number {
    this.assert(this.whyCannotSellFixture(slot));
    const state = this.slots_[slot] as SlotState;
    const fixture = state.fixture as Fixture;
    state.fixture = null;
    if (fixture.def.id === 'warehouse' && !this.slots_.some((s) => s.fixture?.def.id === 'warehouse')) this.stored_ = 0;
    return this.refund(fixture.paid);
  }

  whyCannotSellCard(deckCard: number): string | null {
    if (this.phase_ !== 'shop') return 'Sell in the shop';
    const card = this.deck_[deckCard];
    if (card === undefined) return `No deck card ${deckCard + 1}`;
    if (card.paid === 0) return `${cardName(card)} is a starter card and has no resale value; use Downsizing to remove it`;
    return null;
  }

  sellCard(deckCard: number): number {
    this.assert(this.whyCannotSellCard(deckCard));
    const [card] = this.deck_.splice(deckCard, 1);
    return this.refund((card as Card).paid);
  }

  whyCannotMove(from: number, to: number): string | null {
    if (this.phase_ !== 'shop') return 'Move Fixtures in the shop';
    if (this.slots_[from]?.fixture == null) return `Slot ${from + 1} has no Fixture`;
    if (this.slots_[to] === undefined) return `No slot ${to + 1} (the Line has ${this.slots_.length})`;
    if (from === to) return 'Pick a different slot';
    return this.wallet.canAfford(this.config.moveCost) ? null : `Moving costs ${this.config.moveCost}C`;
  }

  /** Moves a Fixture to another slot (swapping if that slot has one) for 1C. */
  moveFixture(from: number, to: number): void {
    this.assert(this.whyCannotMove(from, to));
    this.wallet.spend(this.config.moveCost);
    const a = this.slots_[from] as SlotState;
    const b = this.slots_[to] as SlotState;
    [a.fixture, b.fixture] = [b.fixture, a.fixture];
  }

  whyCannotReroll(): string | null {
    if (this.phase_ !== 'shop') return 'The shop is closed';
    return this.shop_.whyCannotReroll(this.wallet);
  }

  reroll(): void {
    this.assert(this.whyCannotReroll());
    this.shop_.reroll(this.wallet, this.canExpand());
  }

  whyCannotContinue(): string | null {
    return this.phase_ === 'shop' ? null : 'Not in the shop';
  }

  /** Leaves the shop and starts the next round. */
  continueToNextRound(): void {
    this.assert(this.whyCannotContinue());
    this.round_++;
    this.startRound();
  }

  // ---- round flow ----

  private startRound(): void {
    this.phase_ = 'shift';
    this.sales_ = 0;
    this.shift_ = 1;
    this.retools_ = this.config.retoolsPerRound;
    this.hotPips_ = this.config.hotPips;
    this.lastShift_ = null;
    this.lastPayout_ = null;
    this.storageNotice_ = null;
    for (const slot of this.slots_) slot.card = null;
    this.layout = this.slots_.map((s) => s.fixture);
    this.draw_ = this.deckRng.shuffle(this.deck_);
    this.hand_ = [];
    this.discard_ = [];
    this.beginShift();
  }

  private beginShift(): void {
    const boss = this.boss;
    if (boss !== null) {
      const moved = boss.shiftFixtures(this.slots_.map((s) => s.fixture));
      this.slots_.forEach((slot, i) => (slot.fixture = moved[i] ?? null));
    }
    while (this.hand_.length < this.config.handSize && this.draw_.length > 0) this.hand_.push(this.draw_.pop() as Card);
  }

  /** Make and Ship cards leave the Line; Designs stay unless the boss says otherwise; Automation keeps Makes. */
  private dispatch(): void {
    const designsStay = this.boss?.designsStay() ?? true;
    this.slots_.forEach((slot) => {
      if (slot.card === null) return;
      const card = slot.card.card;
      const keep = (card.def.stage === 'design' && designsStay) || (slot.fixture?.def.effect.keepsOnLine(card) ?? false);
      if (keep) return;
      this.discard_.push(card);
      slot.card = null;
    });
  }

  private clearRound(): void {
    const info = this.quarter;
    const payout = new Payout();
    payout.add(info.isBoard ? 'Board Review cleared' : `Q${info.quarter} cleared`, this.config.income[info.quarter - 1] ?? 0);
    const unused = this.config.shiftsPerRound - this.shift_;
    if (unused > 0) payout.add(`${unused} unused Shift${unused === 1 ? '' : 's'}`, unused * this.config.unusedShiftBonus);
    const interest = computeInterest(this.wallet.cash, this.config.interest);
    if (interest > 0) payout.add('Interest', interest);
    this.wallet.earn(payout.total());
    this.lastPayout_ = payout.lines;
    for (const slot of this.slots_) if (slot.fixture !== null) slot.fixture.roundsOwned++;
    this.endRound(true);
    if (this.round_ >= this.rounds) {
      this.phase_ = 'won';
      return;
    }
    this.enterShop();
  }

  private loseRound(): void {
    this.endRound(false);
    this.phase_ = 'lost';
  }

  private endRound(won: boolean): void {
    this.history_.push({
      round: this.round_,
      isBoard: this.quarter.isBoard,
      target: this.target,
      sales: this.sales_,
      won,
      shiftsUsed: this.shift_,
      capital: this.wallet.cash,
    });
    // Line Shift moved the fixtures during the round; put the player's layout back.
    this.slots_.forEach((slot, i) => {
      slot.fixture = this.layout[i] ?? null;
      if (slot.card !== null) this.discard_.push(slot.card.card);
      slot.card = null;
    });
  }

  private enterShop(): void {
    this.phase_ = 'shop';
    if (this.stored_ > 0) {
      const fee = Math.ceil(this.stored_ / this.config.storagePerCapital);
      if (this.wallet.canAfford(fee)) {
        this.wallet.spend(fee);
        this.storageNotice_ = `Paid ${fee}C storage for ${this.stored_} stored Units`;
      } else {
        this.storageNotice_ = `Could not pay ${fee}C storage: ${this.stored_} stored Units were lost`;
        this.stored_ = 0;
      }
    }
    this.shop_.restock(this.canExpand());
  }

  private applyContract(effect: 'tooling' | 'downsize' | 'expand', deckCard: number | undefined): void {
    switch (effect) {
      case 'tooling':
        (this.deck_[deckCard as number] as Card).upgrades++;
        return;
      case 'downsize':
        this.deck_.splice(deckCard as number, 1);
        return;
      case 'expand':
        this.slots_.push({ fixture: null, card: null });
        return;
    }
  }

  // ---- helpers ----

  private lineForScoring(): LineSlot[] {
    return this.slots_.map((s) => ({ fixture: s.fixture, card: s.card?.card ?? null }));
  }

  private shiftContext() {
    return {
      config: this.config,
      trends: this.trendsNow,
      equity: { ...this.equity_ },
      hotPipsLeft: this.hotPips_,
      stored: this.stored_,
      boss: this.boss,
    };
  }

  private canExpand(): boolean {
    return this.slots_.length < this.config.maxSlots;
  }

  private refund(paid: number): number {
    const amount = Math.floor(paid * this.config.sellRate);
    this.wallet.earn(amount);
    return amount;
  }

  private newCard(def: CardDef, category: Category, paid: number): Card {
    return { uid: this.nextUid++, def, category, paid, upgrades: 0, growth: 0 };
  }

  private newFixture(def: FixtureDef, paid: number): Fixture {
    return { uid: this.nextUid++, def, paid, roundsOwned: 0 };
  }

  private assert(reason: string | null): void {
    if (reason !== null) throw new Error(reason);
  }
}
