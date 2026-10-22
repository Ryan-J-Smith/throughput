import { Deck } from '../../../engine/deck';
import { Payout, Wallet, computeInterest } from '../../../engine/economy';
import { EngineError } from '../../../engine/errors';
import { Rng } from '../../../engine/rng';
import { OwnedBlueprint } from '../model';
import type { BomRule, Disruption, Facility, Part, PartCategory, RndChoice, RoundMods } from '../model';
import { MARKETS } from './config';
import type { BomConfig, MarketKind } from './config';
import { fabricate } from './fabricate';
import { containsRecipe, matchesExactly } from './matching';
import { quoteShip } from './ship';
import type { ShipQuote } from './ship';
import { BomShop } from './shop';
import type { BomOffer, StockContext } from './shop';

/**
 * round: Builds and Scraps until revenue reaches the target (→ overtime, or the round clears if
 * no Builds remain) or the Builds run out (→ lost).
 * overtime: Ship is locked; Fabricate or Scrap, then collect $1 per unused Build.
 * shop: buy, sell, shred, reroll, then continue to the next round.
 */
export type BomPhase = 'round' | 'overtime' | 'shop' | 'won' | 'lost';

export type BomRoundInfo = {
  /** 0-based index into the run's rounds. */
  readonly index: number;
  /** 1-based quarter. */
  readonly quarter: number;
  readonly market: MarketKind;
  readonly target: number;
  /** The disruption in force this round (Boss rounds only). */
  readonly disruption: Disruption | null;
};

export type RoundEnd = {
  readonly cleared: boolean;
  readonly revenue: number;
  readonly target: number;
  /** Cash paid on a clear (reward, unused Builds, interest); null on a loss. */
  readonly payout: Payout | null;
};

export type ShipResult = {
  readonly quote: ShipQuote;
  /** Permanent Demand gained by selling out (0 if not). */
  readonly growth: number;
  readonly drawn: readonly Part[];
  readonly roundEnd: RoundEnd | null;
};

export type FabricateResult = {
  readonly sub: OwnedBlueprint;
  readonly output: Part;
  readonly copiesBenched: readonly Part[];
  readonly copiesLost: number;
  readonly trashed: Part | null;
  readonly drawn: readonly Part[];
  readonly roundEnd: RoundEnd | null;
};

export type ScrapResult = { readonly drawn: readonly Part[]; readonly roundEnd: RoundEnd | null };

/** Target of an R&D Grant purchase. */
export type RndTarget = { readonly blueprintId: string; readonly choice?: RndChoice };

/**
 * One Bill of Materials run: 4 quarters × (Small, Big, Boss). A pure, deterministic state
 * machine; every action has a `whyCannot…` query that returns the reason it is refused (or null),
 * and refused actions change nothing.
 */
export class BomRun {
  readonly config: BomConfig;
  readonly seed: number;
  readonly deck: Deck<Part>;
  readonly wallet: Wallet;
  readonly shop: BomShop;
  /** Fabricated parts waiting outside the hand; they carry over between rounds. */
  readonly bench: Part[];
  /** Disruption drawn for each quarter (revealed at that quarter's first shop). */
  readonly disruptions: readonly Disruption[];

  private readonly owned: OwnedBlueprint[];
  private readonly facilities_: Facility[];
  private phase_: BomPhase = 'round';
  private roundIndex = 0;
  private revenue_ = 0;
  private buildsLeft_ = 0;
  private scrapsLeft_ = 0;
  private shippedThisRound = new Set<string>();
  private lastRoundEnd_: RoundEnd | null = null;

  constructor(config: BomConfig, seed: number) {
    this.config = config;
    this.seed = seed;
    const rng = new Rng(seed);
    this.deck = new Deck(config.startingDeck(), rng.fork('deck'), { handSize: config.handSize });
    this.wallet = new Wallet(config.startingCash);
    this.shop = new BomShop(config.shop, config.blueprints, config.facilities, rng.fork('shop'));
    this.bench = config.startingBench();
    const order = rng.fork('disruptions').shuffle(config.disruptions);
    this.disruptions = config.targets.map((_, q) => order[q % order.length] as Disruption);
    this.owned = config.startingBlueprints.map((id) => new OwnedBlueprint(this.blueprintDef(id)));
    this.facilities_ = config.startingFacilities.map((id) => this.facilityDef(id));
    this.startRound();
  }

  // ---- state ----

  get phase(): BomPhase {
    return this.phase_;
  }

  /** The round being played, or (in the shop and at the end) the round just finished. */
  get round(): BomRoundInfo {
    return this.roundInfo(this.roundIndex);
  }

  /** The round after this one, or null after the last. */
  get nextRound(): BomRoundInfo | null {
    return this.roundIndex + 1 < this.totalRounds ? this.roundInfo(this.roundIndex + 1) : null;
  }

  get totalRounds(): number {
    return this.config.targets.length * MARKETS.length;
  }

  get revenue(): number {
    return this.revenue_;
  }

  get buildsLeft(): number {
    return this.buildsLeft_;
  }

  get scrapsLeft(): number {
    return this.scrapsLeft_;
  }

  get hand(): readonly Part[] {
    return this.deck.hand;
  }

  get blueprints(): readonly OwnedBlueprint[] {
    return this.owned;
  }

  get facilities(): readonly Facility[] {
    return this.facilities_;
  }

  get lastRoundEnd(): RoundEnd | null {
    return this.lastRoundEnd_;
  }

  /** Rules in force now: facilities, plus the disruption during its Boss round. */
  get activeRules(): readonly BomRule[] {
    const disruption = this.inRound() ? this.round.disruption : null;
    return disruption === null ? this.facilities_ : [...this.facilities_, disruption];
  }

  /** Round parameters after facilities (and the active disruption). */
  get mods(): RoundMods {
    return this.modsWith(this.activeRules);
  }

  /** Disruption of `quarter` (1-based) if it has been revealed (its quarter's first shop has opened). */
  revealedDisruption(quarter: number): Disruption | null {
    const smallIndex = (quarter - 1) * MARKETS.length;
    const revealed = this.roundIndex > smallIndex || (this.roundIndex === smallIndex && this.phase_ === 'shop');
    return revealed ? (this.disruptions[quarter - 1] ?? null) : null;
  }

  blueprint(id: string): OwnedBlueprint | undefined {
    return this.owned.find((b) => b.id === id);
  }

  get rndLevelsOwned(): number {
    return this.owned.reduce((sum, b) => sum + b.rndLevels, 0);
  }

  /** Owned Products whose recipe the given parts contain. */
  productsFor(parts: readonly Part[]): OwnedBlueprint[] {
    return this.owned.filter((b) => b.def.kind === 'product' && containsRecipe(b.def.recipe, parts));
  }

  /** The owned Sub whose recipe the parts are exactly, if any. */
  subFor(parts: readonly Part[]): OwnedBlueprint | undefined {
    return this.owned.find((b) => b.def.kind === 'sub' && matchesExactly(b.def.recipe, parts));
  }

  // ---- round actions ----

  whyCannotShip(parts: readonly Part[], productId?: string): string | null {
    if (this.phase_ === 'overtime') return 'Ship is locked in Overtime (target reached)';
    if (this.phase_ !== 'round') return 'Not in a round';
    if (this.buildsLeft_ <= 0) return 'No Builds left';
    const problem = this.selectionProblem(parts, true);
    if (problem !== null) return problem;
    if (productId === undefined) return this.productsFor(parts).length > 0 ? null : 'No owned Product recipe fits these parts';
    const product = this.blueprint(productId);
    if (product === undefined) return `You don't own ${productId}`;
    if (product.def.kind !== 'product') return `${product.def.name} is a Sub; Fabricate it instead`;
    if (!containsRecipe(product.def.recipe, parts)) return `${product.def.name} needs ${recipeText(product.def.recipe)}`;
    return null;
  }

  /** What shipping these parts as each fitting Product would earn (no state change). */
  quoteOptions(parts: readonly Part[]): ShipQuote[] {
    if (this.selectionProblem(parts, true) !== null) return [];
    return this.productsFor(parts).map((product) => this.quote(product, parts));
  }

  /** What shipping `parts` as `productId` would earn, or null if that Ship is not allowed now. */
  quoteFor(productId: string, parts: readonly Part[]): ShipQuote | null {
    if (this.whyCannotShip(parts, productId) !== null) return null;
    return this.quote(this.blueprint(productId) as OwnedBlueprint, parts);
  }

  /**
   * What shipping `parts` as `productId` would earn in the current state, without checking that
   * the parts are held: a planning aid for parts not fabricated yet. Null if the recipe doesn't fit.
   */
  projectShip(productId: string, parts: readonly Part[]): ShipQuote | null {
    const product = this.blueprint(productId);
    if (product === undefined || product.def.kind !== 'product') return null;
    if (parts.length > this.config.maxSelection || !containsRecipe(product.def.recipe, parts)) return null;
    return this.quote(product, parts);
  }

  ship(parts: readonly Part[], productId: string): ShipResult {
    this.check(this.whyCannotShip(parts, productId));
    const product = this.blueprint(productId) as OwnedBlueprint;
    const quote = this.quote(product, parts);
    const growth = quote.sellsOut ? this.mods.sellOutGrowth : 0;
    product.growth += growth;
    product.shipsThisRound++;
    product.shipsThisRun++;
    this.shippedThisRound.add(product.id);
    this.revenue_ += quote.revenue;
    this.consume(parts);
    return { quote, growth, ...this.afterBuild() };
  }

  whyCannotFabricate(parts: readonly Part[], trash?: Part): string | null {
    if (this.phase_ !== 'round' && this.phase_ !== 'overtime') return 'Not in a round';
    if (this.buildsLeft_ <= 0) return 'No Builds left';
    const problem = this.selectionProblem(parts, true);
    if (problem !== null) return problem;
    const sub = this.subFor(parts);
    if (sub === undefined) {
      const subs = this.owned.filter((b) => b.def.kind === 'sub').map((b) => `${b.def.name} = ${recipeText(b.def.recipe)}`);
      return `Not exactly an owned Sub recipe (${subs.join('; ')})`;
    }
    const benchAfter = this.bench.filter((p) => !parts.includes(p));
    const full = benchAfter.length >= this.mods.benchSlots;
    if (trash === undefined) return full ? 'Bench is full: name a Bench part to trash' : null;
    if (!full) return 'The Bench has room; nothing needs trashing';
    if (!benchAfter.includes(trash)) return 'The part to trash must be on the Bench and not an input';
    return null;
  }

  fabricate(parts: readonly Part[], trash?: Part): FabricateResult {
    this.check(this.whyCannotFabricate(parts, trash));
    const sub = this.subFor(parts) as OwnedBlueprint;
    const { output, copies } = fabricate(sub, parts, this.activeRules);
    this.consume(parts);
    if (trash !== undefined) this.bench.splice(this.bench.indexOf(trash), 1);
    this.bench.push(output);
    const slots = this.mods.benchSlots;
    const copiesBenched = copies.slice(0, Math.max(0, slots - this.bench.length));
    this.bench.push(...copiesBenched);
    return {
      sub,
      output,
      copiesBenched,
      copiesLost: copies.length - copiesBenched.length,
      trashed: trash ?? null,
      ...this.afterBuild(),
    };
  }

  whyCannotScrap(parts: readonly Part[]): string | null {
    if (this.phase_ !== 'round' && this.phase_ !== 'overtime') return 'Not in a round';
    if (this.scrapsLeft_ <= 0) return 'No Scraps left';
    if (parts.some((p) => this.bench.includes(p))) return 'Only hand parts can be scrapped';
    return this.selectionProblem(parts, false);
  }

  scrap(parts: readonly Part[]): ScrapResult {
    this.check(this.whyCannotScrap(parts));
    this.scrapsLeft_--;
    this.deck.discard(parts);
    const drawn = this.deck.fillHand();
    return { drawn, roundEnd: this.loseIfStuck() };
  }

  whyCannotCollect(): string | null {
    return this.phase_ === 'overtime' ? null : 'Collect is only for Overtime (after reaching the target)';
  }

  /** Ends Overtime: each unused Build pays $1, then the round clears. */
  collect(): RoundEnd {
    this.check(this.whyCannotCollect());
    return this.clearRound();
  }

  // ---- shop ----

  /** Problems with buying `slot` that don't depend on an R&D Grant's target (phase, cash, slot limits). */
  offerProblem(slot: number): string | null {
    if (this.phase_ !== 'shop') return 'The shop is closed';
    const offer = this.shop.offers[slot];
    if (offer == null) return `Nothing for sale in slot ${slot + 1}`;
    if (!this.wallet.canAfford(offer.cost)) return `Not enough cash ($${offer.cost} needed)`;
    if (offer.kind === 'facility' && this.facilities_.length >= this.config.shop.maxFacilities) {
      return `Facility slots full (${this.config.shop.maxFacilities})`;
    }
    if (offer.kind === 'blueprint' && this.owned.length >= this.config.shop.maxBlueprints) {
      return `Blueprint slots full (${this.config.shop.maxBlueprints})`;
    }
    return null;
  }

  whyCannotBuy(slot: number, target?: RndTarget): string | null {
    const problem = this.offerProblem(slot);
    if (problem !== null) return problem;
    const offer = this.shop.offers[slot] as BomOffer;
    switch (offer.kind) {
      case 'facility':
      case 'blueprint':
      case 'part':
        return null;
      case 'rnd': {
        if (target === undefined) return 'R&D Grant needs a blueprint (and scale or premium for a Product)';
        const blueprint = this.blueprint(target.blueprintId);
        if (blueprint === undefined) return `You don't own ${target.blueprintId}`;
        if (blueprint.def.kind === 'product' && target.choice === undefined) return `Choose scale or premium for ${blueprint.def.name}`;
        if (blueprint.def.kind === 'sub' && target.choice !== undefined) return `${blueprint.def.name} is a Sub; R&D adds +3 output grade (no choice)`;
        return null;
      }
    }
  }

  buy(slot: number, target?: RndTarget): BomOffer {
    this.check(this.whyCannotBuy(slot, target));
    const offer = this.shop.take(slot);
    this.wallet.spend(offer.cost);
    switch (offer.kind) {
      case 'facility':
        this.facilities_.push(offer.facility);
        break;
      case 'blueprint':
        this.owned.push(new OwnedBlueprint(offer.blueprint));
        break;
      case 'part':
        this.deck.add(offer.part);
        break;
      case 'rnd': {
        const t = target as RndTarget;
        (this.blueprint(t.blueprintId) as OwnedBlueprint).addLevel(t.choice);
        break;
      }
    }
    return offer;
  }

  sellValue(cost: number): number {
    return Math.floor(cost * this.config.shop.sellRate);
  }

  /** `id` is a facility or blueprint id. */
  whyCannotSell(id: string): string | null {
    if (this.phase_ !== 'shop') return 'You can only sell in the shop';
    const facility = this.facilities_.find((f) => f.id === id);
    if (facility !== undefined) {
      const remaining = this.facilities_.filter((f) => f !== facility);
      if (this.bench.length > this.benchSlotsWith(remaining)) return `The Bench holds ${this.bench.length} parts; selling ${facility.name} would overfill it`;
      return null;
    }
    const blueprint = this.blueprint(id);
    if (blueprint === undefined) return `You own no facility or blueprint "${id}"`;
    const products = this.owned.filter((b) => b.def.kind === 'product');
    if (blueprint.def.kind === 'product' && products.length === 1) return "You can't sell your last Product";
    return null;
  }

  sell(id: string): number {
    this.check(this.whyCannotSell(id));
    const facility = this.facilities_.find((f) => f.id === id);
    const cost = facility !== undefined ? facility.cost : (this.blueprint(id) as OwnedBlueprint).def.cost;
    if (facility !== undefined) this.facilities_.splice(this.facilities_.indexOf(facility), 1);
    else this.owned.splice(this.owned.findIndex((b) => b.id === id), 1);
    const value = this.sellValue(cost);
    this.wallet.earn(value);
    return value;
  }

  /** The deck part Shred would destroy for this category and grade (non-premium preferred). */
  shredTarget(category: PartCategory, grade: number): Part | undefined {
    const matches = this.deck.allCards.filter((p) => p.category === category && p.grade === grade);
    return matches.find((p) => !p.premium) ?? matches[0];
  }

  whyCannotShred(category: PartCategory, grade: number): string | null {
    if (this.phase_ !== 'shop') return 'The shop is closed';
    if (this.shop.shredUsed) return 'Shred is once per shop visit';
    if (!this.wallet.canAfford(this.config.shop.shredCost)) return `Not enough cash ($${this.config.shop.shredCost} needed)`;
    if (this.deck.allCards.length <= this.config.handSize) return `The deck can't go below ${this.config.handSize} parts`;
    return this.shredTarget(category, grade) === undefined ? `No ${category} ${grade} in your deck` : null;
  }

  shred(category: PartCategory, grade: number): Part {
    this.check(this.whyCannotShred(category, grade));
    const part = this.shredTarget(category, grade) as Part;
    this.wallet.spend(this.config.shop.shredCost);
    this.deck.remove(part);
    this.shop.markShredUsed();
    return part;
  }

  whyCannotReroll(): string | null {
    if (this.phase_ !== 'shop') return 'The shop is closed';
    return this.wallet.canAfford(this.shop.rerollCost) ? null : `Not enough cash ($${this.shop.rerollCost} needed)`;
  }

  reroll(): void {
    this.check(this.whyCannotReroll());
    this.wallet.spend(this.shop.rerollCost);
    this.shop.reroll(this.stockContext(false));
  }

  whyCannotLeaveShop(): string | null {
    return this.phase_ === 'shop' ? null : 'Not in the shop';
  }

  leaveShop(): void {
    this.check(this.whyCannotLeaveShop());
    this.roundIndex++;
    this.startRound();
  }

  // ---- internals ----

  private startRound(): void {
    this.phase_ = 'round';
    const mods = this.mods;
    this.revenue_ = 0;
    this.buildsLeft_ = mods.builds;
    this.scrapsLeft_ = mods.scraps;
    this.shippedThisRound = new Set();
    for (const b of this.owned) b.shipsThisRound = 0;
    this.deck.handSize = mods.handSize;
    this.deck.resetForRound();
    for (const rule of this.activeRules) rule.onRoundStart(this.bench);
    this.deck.fillHand();
    this.loseIfStuck();
  }

  private quote(product: OwnedBlueprint, parts: readonly Part[]): ShipQuote {
    return quoteShip({
      blueprint: product,
      parts,
      rules: this.activeRules,
      mods: this.mods,
      isFirstShip: this.shippedThisRound.size === 0,
      shippedThisRound: this.shippedThisRound,
      rndLevelsOwned: this.rndLevelsOwned,
      mostShipped: this.mostShipped(),
    });
  }

  private mostShipped(): Set<string> {
    const max = Math.max(0, ...this.owned.map((b) => b.shipsThisRun));
    return new Set(max === 0 ? [] : this.owned.filter((b) => b.shipsThisRun === max).map((b) => b.id));
  }

  /** Hand parts go to the discard pile; Bench parts are used up. */
  private consume(parts: readonly Part[]): void {
    this.deck.discard(parts.filter((p) => !this.bench.includes(p)));
    for (const p of parts) {
      const i = this.bench.indexOf(p);
      if (i >= 0) this.bench.splice(i, 1);
    }
  }

  private afterBuild(): { drawn: readonly Part[]; roundEnd: RoundEnd | null } {
    this.buildsLeft_--;
    const drawn = this.deck.fillHand();
    const target = this.round.target;
    if (this.phase_ === 'round' && this.revenue_ >= target) {
      if (this.buildsLeft_ > 0) {
        this.phase_ = 'overtime';
        return { drawn, roundEnd: null };
      }
      return { drawn, roundEnd: this.clearRound() };
    }
    if (this.phase_ === 'overtime' && this.buildsLeft_ <= 0) return { drawn, roundEnd: this.clearRound() };
    if (this.phase_ === 'round' && this.buildsLeft_ <= 0) return { drawn, roundEnd: this.loseRound() };
    return { drawn, roundEnd: this.loseIfStuck() };
  }

  private clearRound(): RoundEnd {
    const round = this.round;
    const payout = new Payout();
    payout.add(`${capitalize(round.market)} market cleared`, this.config.rewards[round.market]);
    if (this.buildsLeft_ > 0) payout.add(`Unused Builds ×${this.buildsLeft_}`, this.buildsLeft_);
    const interest = computeInterest(this.wallet.cash, this.config.interest);
    if (interest > 0) payout.add('Interest', interest);
    this.wallet.earn(payout.total());
    this.buildsLeft_ = 0;
    const end: RoundEnd = { cleared: true, revenue: this.revenue_, target: round.target, payout };
    this.lastRoundEnd_ = end;
    if (this.roundIndex >= this.totalRounds - 1) {
      this.phase_ = 'won';
    } else {
      this.phase_ = 'shop';
      this.shop.restock(this.stockContext(round.market === 'boss'));
    }
    return end;
  }

  private loseRound(): RoundEnd {
    this.phase_ = 'lost';
    const end: RoundEnd = { cleared: false, revenue: this.revenue_, target: this.round.target, payout: null };
    this.lastRoundEnd_ = end;
    return end;
  }

  /** In a round with no possible Build and no Scraps, the round is lost. */
  private loseIfStuck(): RoundEnd | null {
    if (this.phase_ !== 'round' || this.scrapsLeft_ > 0) return null;
    const available = [...this.deck.hand, ...this.bench];
    const canBuild = this.owned.some((b) => containsRecipe(b.def.recipe, available));
    return canBuild ? null : this.loseRound();
  }

  private stockContext(guaranteeUncommon: boolean): StockContext {
    return {
      ownedBlueprints: new Set(this.owned.map((b) => b.id)),
      ownedFacilities: new Set(this.facilities_.map((f) => f.id)),
      guaranteeUncommon,
    };
  }

  /** Round `index` (0-based). Its disruption is the real one even before it is revealed. */
  roundInfo(index: number): BomRoundInfo {
    const quarter = Math.floor(index / MARKETS.length) + 1;
    const market = MARKETS[index % MARKETS.length] as MarketKind;
    const targets = this.config.targets[quarter - 1] ?? [0, 0, 0];
    const target = targets[index % MARKETS.length] ?? 0;
    return { index, quarter, market, target, disruption: market === 'boss' ? (this.disruptions[quarter - 1] ?? null) : null };
  }

  private inRound(): boolean {
    return this.phase_ === 'round' || this.phase_ === 'overtime';
  }

  private modsWith(rules: readonly BomRule[]): RoundMods {
    const mods: RoundMods = {
      builds: this.config.builds,
      scraps: this.config.scraps,
      handSize: this.config.handSize,
      benchSlots: this.config.benchSlots,
      sellOutGrowth: this.config.sellOutGrowth,
      demandHalves: true,
    };
    for (const rule of rules) rule.adjust(mods);
    return mods;
  }

  private benchSlotsWith(facilities: readonly Facility[]): number {
    return this.modsWith(facilities).benchSlots;
  }

  /** Validates a Build/Scrap selection: size, distinct parts, all in hand (or Bench if allowed). */
  private selectionProblem(parts: readonly Part[], allowBench: boolean): string | null {
    if (parts.length === 0) return 'Select at least one part';
    if (parts.length > this.config.maxSelection) return `Select at most ${this.config.maxSelection} parts`;
    if (new Set(parts).size !== parts.length) return 'Each part may be selected once';
    for (const p of parts) {
      const inHand = this.deck.hand.includes(p);
      if (!inHand && !(allowBench && this.bench.includes(p))) return allowBench ? 'Selected parts must be in your hand or on the Bench' : 'Selected parts must be in your hand';
    }
    return null;
  }

  private check(reason: string | null): void {
    if (reason !== null) throw new EngineError(reason);
  }

  private blueprintDef(id: string) {
    const def = this.config.blueprints.find((b) => b.id === id);
    if (def === undefined) throw new EngineError(`Unknown blueprint "${id}"`);
    return def;
  }

  private facilityDef(id: string): Facility {
    const facility = this.config.facilities.find((f) => f.id === id);
    if (facility === undefined) throw new EngineError(`Unknown facility "${id}"`);
    return facility;
  }
}

export function recipeText(recipe: readonly PartCategory[]): string {
  return recipe.map(capitalize).join('+');
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
