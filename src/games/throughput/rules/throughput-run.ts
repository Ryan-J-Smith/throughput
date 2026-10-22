import { Payout, Wallet, computeInterest } from '../../../engine/economy';
import type { PayoutLine } from '../../../engine/economy';
import { Rng } from '../../../engine/rng';
import { BOSSES, DEFAULT_CONFIG, STARTER_CARDS } from '../content';
import type { ThroughputConfig } from '../content';
import { CATEGORIES, cardName } from '../model';
import type { BoardBoss, Card, CardDef, Category, ContractDef, ContractEffect, Fixture, FixtureDef, GrantLevels, GrantOption, Perks, Stage } from '../model';
import { trendSchedule } from './market';
import { scoreLine } from './score-line';
import type { LineSlot, ShiftContext, ShiftResult, Trends } from './score-line';
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
  /** What each Shift of the round made, in order. */
  readonly shiftTotals: readonly number[];
  /** Capital after the round's payout. */
  readonly capital: number;
};

/** A load instruction: hand index → slot index, both 0-based. The hand index is into `hand`, not `handSlots`. */
export type Placement = { readonly hand: number; readonly slot: number };

/** A Fixture a boss moved at the start of a Shift (0-based slots). */
export type FixtureMove = { readonly fixture: Fixture; readonly from: number; readonly to: number };

/** What `buy` acts on: a Line slot for a Fixture, a deck card for a targeted Contract. */
export type BuyTarget = { readonly slot?: number; readonly deckCard?: number; readonly category?: Category; readonly option?: GrantOption };

type SlotState = { fixture: Fixture | null; card: LineCard | null };

/**
 * A THROUGHPUT run: 12 rounds of up to 4 Shifts each, with a shop between rounds. A game-specific
 * state machine rather than engine Run, because a round is "load cards into Line slots, then run
 * the Batch", and Designs stay on the Line between Shifts.
 *
 * Every action has a `whyCannot…` query; the action itself throws if called anyway, and a
 * refused action never changes state.
 */
/** Capital per unused Shift in a non-Board round of `year` (the config's last entry holds for later Years). */
export function unusedShiftPay(config: ThroughputConfig, year: number): number {
  const table = config.unusedShiftBonus;
  return table[Math.min(year, table.length) - 1] ?? 0;
}

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
  /** Each Category's Demand (grows for good) and what is left of it this round. */
  private readonly demand_: Record<Category, number>;
  private readonly demandLeft_: Record<Category, number>;
  private readonly roundDemand_: Record<Category, number>;
  private readonly demandAtStart_: Record<Category, number>;
  private readonly grants_: Record<Category, { scale: number; premium: number }>;
  /** Run-long bonuses from Ad Campaign, Training Program and Treasury Bond. */
  private readonly perks_ = { hotPips: 0, retools: 0, coupon: 0 };
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
  /** The hand in position order (see `handSlots`). */
  private hand_: Card[] = [];
  /**
   * Hand position per card uid. A card keeps its position while it is in hand and draws fill the
   * gaps, so hand numbers don't shift under the player. Kept after a card leaves, so an unloaded
   * card can go back to its old spot.
   */
  private readonly handPos_ = new Map<number, number>();
  private discard_: Card[] = [];
  /** Fixtures as the player arranged them, restored after a round (Line Shift moves them). */
  private layout: (Fixture | null)[] = [];
  private lastShift_: ShiftResult | null = null;
  private shiftTotals_: number[] = [];
  private fixtureMoves_: readonly FixtureMove[] = [];
  private restocksLeft_ = 0;
  private restocked_ = 0;
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
    this.demand_ = Object.fromEntries(CATEGORIES.map((c) => [c, config.demand.start])) as Record<Category, number>;
    this.demandLeft_ = { ...this.demand_ };
    this.roundDemand_ = { ...this.demand_ };
    this.demandAtStart_ = { ...this.demand_ };
    this.grants_ = Object.fromEntries(CATEGORIES.map((c) => [c, { scale: 0, premium: 0 }])) as Record<Category, { scale: number; premium: number }>;
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

  /** Each Category's Demand: the Units it buys per round (before a Saturated halving). */
  get demand(): Readonly<Record<Category, number>> {
    return this.demand_;
  }

  /** Demand left this round per Category (in the shop: what the round just played left). */
  get demandLeft(): Readonly<Record<Category, number>> {
    return this.demandLeft_;
  }

  /** Demand at the start of this round, after any Saturated halving: what `demandLeft` counts down from. */
  get roundDemand(): Readonly<Record<Category, number>> {
    return this.roundDemand_;
  }

  /** Permanent Demand earned this round (sell-outs, Emerging sales); it counts from next round. */
  get demandEarned(): Readonly<Record<Category, number>> {
    return Object.fromEntries(CATEGORIES.map((c) => [c, this.demand_[c] - this.demandAtStart_[c]])) as Record<Category, number>;
  }

  /** What `category` buys in `round` at its current Demand: halved while Saturated, and by a Recession boss. */
  demandIn(round: number, category: Category): number {
    const saturated = this.trends[round - 1]?.[category] === 'saturated';
    const boss = this.bossOf(round)?.demandMul() ?? 1;
    return Math.floor(this.demand_[category] * (saturated ? this.config.demand.saturatedMul : 1) * boss);
  }

  /** R&D Grant levels bought per Category. */
  get grants(): Readonly<Record<Category, GrantLevels>> {
    return this.grants_;
  }

  /** Run-long bonuses bought with Contracts. */
  get perks(): Perks {
    return this.perks_;
  }

  /** Shifts in the current round (a boss may shorten it). */
  get shiftsThisRound(): number {
    return this.boss?.shiftsPerRound(this.config.shiftsPerRound) ?? this.config.shiftsPerRound;
  }

  /** Hot buzz pips per round, with Ad Campaigns. */
  get hotPipsPerRound(): number {
    return this.config.hotPips + this.perks_.hotPips;
  }

  /** Retools per round, with Training Programs. */
  get retoolsPerRound(): number {
    return this.config.retoolsPerRound + this.perks_.retools;
  }

  /** The interest rule in force. */
  get interestRule(): ThroughputConfig['interest'] {
    return this.config.interest;
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

  /** The cards in hand, in position order. Placements and Retools index this array. */
  get hand(): readonly Card[] {
    return this.hand_;
  }

  /** The hand by stable position, with null gaps where a card left and nothing has been drawn yet. */
  get handSlots(): readonly (Card | null)[] {
    const out: (Card | null)[] = [];
    for (const card of this.hand_) {
      const pos = this.handPos_.get(card.uid) ?? out.length;
      while (out.length < pos) out.push(null);
      out[pos] = card;
    }
    return out;
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

  /** Fixtures the boss moved at the start of the current Shift (Line Shift); empty otherwise. */
  /** Restocks left this round: an empty draw pile takes the shuffled discards when you would draw. */
  get restocksLeft(): number {
    return this.restocksLeft_;
  }

  /** Cards the Restocks shuffled back into the draw pile this round (0 if none happened). */
  get restocked(): number {
    return this.restocked_;
  }

  get fixtureMoves(): readonly FixtureMove[] {
    return this.fixtureMoves_;
  }

  /** Payout of the round just cleared (in the shop or after the win), else null. */
  get lastPayout(): readonly PayoutLine[] | null {
    return this.lastPayout_;
  }

  /** The Warehouse stock waiting for the next Board Review, noted on entering the shop (null if none). */
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
    // In the shop the current round is the one just cleared, so look from the next.
    const from = this.phase_ === 'shop' ? this.round_ + 1 : this.round_;
    for (let round = from; round <= this.rounds && out.length < count; round++) {
      const boss = this.bossOf(round);
      if (boss !== null) out.push({ round, year: this.quarterOf(round).year, boss });
    }
    return out;
  }

  /** Overkill pay that round Sales of `sales` would earn when the round clears (0 at or below the target). */
  overkillPayFor(sales: number): number {
    const over = sales - this.target;
    if (over <= 0 || this.target <= 0) return 0;
    const { step, cap } = this.config.overkill;
    return Math.min(cap, Math.floor(over / (step * this.target) + 1e-9));
  }

  /** What the Line would make if run now. */
  preview(): ShiftResult {
    return scoreLine(this.lineForScoring(), this.shiftContext());
  }

  isWelded(slot: number): boolean {
    return this.boss?.isWelded(slot) ?? false;
  }

  /**
   * True if the card in this slot stays on the Line after the Shift runs: Designs stay unless the
   * boss says otherwise, and a Fixture may keep its card (Automation keeps Makes). False for an empty slot.
   */
  staysAfterShift(slot: number): boolean {
    const state = this.slots_[slot];
    const card = state?.card?.card;
    if (state === undefined || card === undefined) return false;
    return (card.def.stage === 'design' && (this.boss?.designsStay() ?? true)) || (state.fixture?.def.effect.keepsOnLine(card) ?? false);
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
      this.removeFromHand(card);
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
      if (held.loadedShift !== this.shift_ && !(this.boss?.recallsParked() ?? false)) {
        return `${cardName(held.card)} in slot ${slot + 1} is parked from an earlier Shift; scrap it instead`;
      }
    }
    return null;
  }

  /** Returns cards loaded this Shift to the hand (and parked ones, when the boss allows it: Line Shift). */
  unload(slots: readonly number[]): void {
    this.assert(this.whyCannotUnload(slots));
    for (const slot of slots) {
      const state = this.slots_[slot] as SlotState;
      const card = (state.card as LineCard).card;
      this.addToHand(card, this.handPos_.get(card.uid));
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

  /** Discards up to 3 hand cards and draws as many (fewer if the deck runs out) into their positions. */
  retool(hand: readonly number[]): void {
    this.assert(this.whyCannotRetool(hand));
    const cards = hand.map((i) => this.hand_[i] as Card);
    const freed = cards.map((card) => this.removeFromHand(card)).sort((a, b) => a - b);
    this.discard_.push(...cards);
    this.retools_--;
    for (const pos of freed) {
      const drawn = this.drawOne();
      if (drawn === undefined) break;
      this.addToHand(drawn, pos);
    }
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
    for (const c of CATEGORIES) {
      this.demandLeft_[c] -= result.demandSold[c] ?? 0;
      this.demand_[c] += result.demandGrowth[c] ?? 0;
    }
    this.stored_ = result.storedAfter;
    this.dispatch();
    this.lastShift_ = result;
    this.shiftTotals_.push(result.total);

    if (this.sales_ >= this.target) this.clearRound();
    else if (this.shift_ >= this.shiftsThisRound) this.loseRound();
    else {
      this.shift_++;
      this.beginShift();
    }
    return result;
  }

  // ---- shop actions ----

  whyCannotBuy(offer: number, target: BuyTarget = {}): string | null {
    if (this.phase_ !== 'shop') return 'The shop is closed';
    const item = this.shop_.offers[offer];
    if (item?.kind === 'fixture') {
      if (target.slot === undefined) return `Say which slot gets the ${item.def.name} (buy ${offer + 1} <slot>)`;
      const slot = this.slots_[target.slot];
      if (slot === undefined) return `No slot ${target.slot + 1} (the Line has ${this.slots_.length})`;
      // A Fixture already in the slot is sold as part of the buy, and its refund counts toward the price.
      const refund = this.fixtureRefund(target.slot);
      if (this.wallet.cash + refund < item.price) {
        return `Not enough Capital (${item.price}C${refund > 0 ? `; selling ${slot.fixture?.def.name ?? ''} returns ${refund}C` : ''})`;
      }
      return null;
    }
    const reason = this.shop_.whyCannotBuy(offer, this.wallet);
    if (reason !== null) return reason;
    if (item == null) return 'Nothing for sale in that slot';
    if (item.kind === 'contract') {
      const unavailable = this.whyContractUnavailable(item.def);
      if (unavailable !== null) return unavailable;
      if (item.def.targetsCard) {
        if (target.deckCard === undefined) return `Say which deck card (buy ${offer + 1} <deck card>)`;
        const card = this.deck_[target.deckCard];
        if (card === undefined) return `No deck card ${target.deckCard + 1}`;
        if (item.def.effect === 'downsize' && this.deck_.length <= 1) return 'Your deck needs at least one card';
        if (item.def.effect === 'tooling' && card.def.stage === 'ship' && typeof card.def.cap !== 'number') {
          return `${cardName(card)} has no cap to raise (it sells ${card.def.cap === 'all' ? 'all Units' : 'up to Demand'})`;
        }
      }
      if (item.def.targetsCategory) {
        if (target.category === undefined || target.option === undefined) return `Say which Category and scale or premium (buy ${offer + 1} <category> scale|premium)`;
        if (!CATEGORIES.includes(target.category)) return `No Category ${target.category}`;
      }
    }
    return null;
  }

  /** Buys an offer; a Fixture bought into an occupied slot first sells the one there for half its price. */
  buy(offer: number, target: BuyTarget = {}): Offer {
    this.assert(this.whyCannotBuy(offer, target));
    if (this.shop_.offers[offer]?.kind === 'fixture' && this.slots_[target.slot as number]?.fixture != null) this.sellFixture(target.slot as number);
    const item = this.shop_.buy(offer, this.wallet);
    switch (item.kind) {
      case 'fixture':
        (this.slots_[target.slot as number] as SlotState).fixture = this.newFixture(item.def, item.price);
        break;
      case 'card':
        this.deck_.push(this.newCard(item.def, item.category, item.price));
        break;
      case 'contract':
        this.applyContract(item.def.effect, target);
        break;
    }
    return item;
  }

  whyCannotSellFixture(slot: number): string | null {
    if (this.phase_ !== 'shop') return 'Sell in the shop';
    return this.slots_[slot]?.fixture == null ? `Slot ${slot + 1} has no Fixture` : null;
  }

  /** Capital that selling the Fixture in `slot` returns (0 for an empty slot). */
  fixtureRefund(slot: number): number {
    const fixture = this.slots_[slot]?.fixture;
    return fixture == null ? 0 : Math.floor(fixture.paid * this.config.sellRate);
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
    this.shop_.reroll(this.wallet, (c) => this.whyContractUnavailable(c) === null);
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
    this.retools_ = this.retoolsPerRound;
    this.hotPips_ = this.hotPipsPerRound;
    for (const c of CATEGORIES) {
      this.demandAtStart_[c] = this.demand_[c];
      this.demandLeft_[c] = this.demandIn(this.round_, c);
      this.roundDemand_[c] = this.demandLeft_[c];
    }
    this.lastShift_ = null;
    this.shiftTotals_ = [];
    this.lastPayout_ = null;
    this.storageNotice_ = null;
    for (const slot of this.slots_) slot.card = null;
    this.layout = this.slots_.map((s) => s.fixture);
    this.draw_ = this.deckRng.shuffle(this.deck_);
    this.hand_ = [];
    this.handPos_.clear();
    this.discard_ = [];
    this.restocksLeft_ = this.config.restocksPerRound;
    this.restocked_ = 0;
    this.beginShift();
    this.fixOpeningHand();
  }

  private beginShift(): void {
    const boss = this.boss;
    this.fixtureMoves_ = [];
    if (boss !== null) {
      const before = this.slots_.map((s) => s.fixture);
      const moved = boss.shiftFixtures(before, this.shift_);
      this.slots_.forEach((slot, i) => (slot.fixture = moved[i] ?? null));
      this.fixtureMoves_ = moved.flatMap((fixture, to) => {
        const from = fixture === null ? to : before.indexOf(fixture);
        return fixture === null || from === to ? [] : [{ fixture, from, to }];
      });
    }
    while (this.hand_.length < this.config.handSize) {
      const card = this.drawOne();
      if (card === undefined) break;
      this.addToHand(card);
    }
  }

  /** The top card of the draw pile. An empty pile first Restocks from the discards, if a Restock is left. */
  private drawOne(): Card | undefined {
    if (this.draw_.length === 0 && this.discard_.length > 0 && this.restocksLeft_ > 0) {
      this.restocksLeft_--;
      this.restocked_ += this.discard_.length;
      this.draw_ = this.deckRng.shuffle(this.discard_);
      this.discard_ = [];
    }
    return this.draw_.pop();
  }

  /**
   * Gives the opening hand at least one card of each `openingHandTypes` type: a missing type swaps
   * the next such card in the draw pile for a card of the hand's most common type, which takes its
   * place in the pile. Nothing changes if the pile has none of that type.
   */
  private fixOpeningHand(): void {
    const count = (stage: Stage) => this.hand_.filter((c) => c.def.stage === stage).length;
    for (const stage of this.config.openingHandTypes) {
      if (count(stage) > 0) continue;
      // The draw pile is drawn from its end, so the next card of a type is its last index.
      let next = this.draw_.length - 1;
      while (next >= 0 && this.draw_[next]?.def.stage !== stage) next--;
      if (next < 0) continue;
      const surplus = (['design', 'make', 'ship'] as const).filter((s) => s !== stage).reduce((a, b) => (count(b) > count(a) ? b : a));
      const out = [...this.hand_].reverse().find((c) => c.def.stage === surplus);
      if (out === undefined) continue;
      const pos = this.removeFromHand(out);
      this.addToHand(this.draw_[next] as Card, pos);
      this.draw_[next] = out;
    }
  }

  /** Puts a card in the hand at `pos` if that position is free, else at the lowest free one. */
  private addToHand(card: Card, pos?: number): void {
    const taken = new Set(this.hand_.map((c) => this.handPos_.get(c.uid)));
    let at = pos !== undefined && !taken.has(pos) ? pos : 0;
    while (taken.has(at)) at++;
    this.handPos_.set(card.uid, at);
    const after = this.hand_.findIndex((c) => (this.handPos_.get(c.uid) ?? 0) > at);
    this.hand_.splice(after < 0 ? this.hand_.length : after, 0, card);
  }

  /** Takes a card out of the hand and returns the position it held. */
  private removeFromHand(card: Card): number {
    this.hand_.splice(this.hand_.indexOf(card), 1);
    return this.handPos_.get(card.uid) ?? 0;
  }

  /** Make and Ship cards leave the Line; Designs stay unless the boss says otherwise; Automation keeps Makes. */
  private dispatch(): void {
    this.slots_.forEach((slot, i) => {
      if (slot.card === null || this.staysAfterShift(i)) return;
      this.discard_.push(slot.card.card);
      slot.card = null;
    });
  }

  private clearRound(): void {
    const info = this.quarter;
    const payout = new Payout();
    payout.add(info.isBoard ? 'Board Review cleared' : `Q${info.quarter} cleared`, this.config.income[info.quarter - 1] ?? 0);
    const unused = this.shiftsThisRound - this.shift_;
    const perUnused = info.isBoard ? 0 : unusedShiftPay(this.config, info.year);
    if (unused > 0 && perUnused > 0) payout.add(`${unused} unused Shift${unused === 1 ? '' : 's'}`, unused * perUnused);
    const overkill = this.overkillPayFor(this.sales_);
    if (overkill > 0) payout.add(`Overkill (${Math.floor((100 * (this.sales_ - this.target)) / this.target)}% over target)`, overkill);
    const interest = computeInterest(this.wallet.cash, this.interestRule);
    if (interest > 0) payout.add('Interest', interest);
    if (this.perks_.coupon > 0) payout.add(`Treasury Bond${this.perks_.coupon === 1 ? '' : ` ×${this.perks_.coupon}`}`, this.perks_.coupon);
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
      shiftTotals: [...this.shiftTotals_],
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
    if (this.stored_ > 0) this.storageNotice_ = `Warehouse: ${this.stored_} Units in stock for the next Board Review`;
    this.shop_.restock((c) => this.whyContractUnavailable(c) === null);
  }

  private applyContract(effect: ContractEffect, { deckCard, category, option }: BuyTarget): void {
    switch (effect) {
      case 'grant': {
        const grant = this.grants_[category as Category];
        if (option === 'scale') {
          grant.scale++;
          this.demand_[category as Category] += this.config.grant.scaleDemand;
        } else grant.premium++;
        return;
      }
      case 'tooling':
        (this.deck_[deckCard as number] as Card).upgrades++;
        return;
      case 'downsize':
        this.deck_.splice(deckCard as number, 1);
        return;
      case 'expand':
        this.slots_.push({ fixture: null, card: null });
        return;
      case 'clone': {
        // A Clone resells like the card it copies: at half that card's price (a starter's copy has none).
        const card = this.deck_[deckCard as number] as Card;
        this.deck_.push({ ...this.newCard(card.def, card.category, card.def.price), upgrades: card.upgrades, growth: card.growth });
        return;
      }
      case 'campaign':
        this.perks_.hotPips++;
        return;
      case 'training':
        this.perks_.retools++;
        return;
      case 'bond':
        this.perks_.coupon++;
        return;
    }
  }

  // ---- helpers ----

  private lineForScoring(): LineSlot[] {
    return this.slots_.map((s) => ({ fixture: s.fixture, card: s.card?.card ?? null }));
  }

  /** What scoring needs besides the Line: trends, Demand, Grants, pips, storage, boss (a snapshot). */
  shiftContext(): ShiftContext {
    return {
      config: this.config,
      trends: this.trendsNow,
      hotPipsLeft: this.hotPips_,
      stored: this.stored_,
      shift: this.shift_,
      boss: this.boss,
      demand: { ...this.demand_ },
      demandLeft: { ...this.demandLeft_ },
      grants: Object.fromEntries(CATEGORIES.map((c) => [c, { ...this.grants_[c] }])) as Record<Category, GrantLevels>,
    };
  }

  /** Why the shop can't offer (or sell) a Contract now: a full Line can't expand, and Training is once a run. */
  private whyContractUnavailable(contract: ContractDef): string | null {
    if (contract.effect === 'expand' && this.slots_.length >= this.config.maxSlots) return `The Line is already at ${this.config.maxSlots} slots`;
    if (contract.effect === 'training' && this.perks_.retools > 0) return 'Training Program is once a run';
    return null;
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
