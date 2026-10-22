import type { Rng } from '../../../engine/rng';
import { CATEGORIES, makeUnits } from '../model';
import type { Card, Category, GrantOption } from '../model';
import type { BuyTarget, Offer, ShiftResult, ThroughputRun } from '../rules';
import { classifyBuild, planLoad, preferredSlot, retoolChoice, scrapChoice } from './planner';
import type { PlanOptions } from './planner';
import { ThroughputBot } from './throughput-bot';
import type { ShiftDecision, ShopDecision } from './throughput-bot';

/** How much more a Fixture on offer must be wanted than an owned one to replace it. */
const REPLACE_MARGIN = 4;

/**
 * Shared play for every bot: Retool once per Shift if the hand can't sell, load the greedy plan,
 * then run. In the shop, buy the most-wanted affordable offer above the Capital reserve, reroll
 * when the strategy asks, otherwise leave. Strategies differ in what they want and where.
 */
abstract class StrategyBot extends ThroughputBot {
  private retooledAt = '';
  private rerollsThisVisit = 0;
  private visit = -1;
  /** Units sold and sell-outs per Category this run, read from each Shift's result. */
  private sold = new Map<Category, number>();
  private soldOuts = new Map<Category, number>();
  private ships = new Map<Category, number>();
  private seenShift: ShiftResult | null = null;

  override beginRun(_run: ThroughputRun, _rng: Rng): void {
    this.sold = new Map();
    this.soldOuts = new Map();
    this.ships = new Map();
    this.seenShift = null;
  }

  /** Records the last Shift's sales once. */
  private observe(run: ThroughputRun): void {
    const last = run.lastShift;
    if (last === null || last === this.seenShift) return;
    this.seenShift = last;
    for (const [c, n] of Object.entries(last.demandSold) as [Category, number][]) {
      this.sold.set(c, (this.sold.get(c) ?? 0) + n);
      this.ships.set(c, (this.ships.get(c) ?? 0) + 1);
    }
    for (const c of last.soldOut) this.soldOuts.set(c, (this.soldOuts.get(c) ?? 0) + 1);
  }

  /** The Category this run has sold most Units of (first on ties). */
  protected bestSeller(): Category {
    return CATEGORIES.reduce((a, b) => ((this.sold.get(b) ?? 0) > (this.sold.get(a) ?? 0) ? b : a));
  }

  /** Mean Units sold per Shift that sold `category`. */
  protected unitsPerShip(category: Category): number {
    return (this.sold.get(category) ?? 0) / Math.max(1, this.ships.get(category) ?? 0);
  }

  /** How much the bot wants an offer (0 or less: never buys it). */
  protected abstract want(offer: Offer, run: ThroughputRun): number;

  protected abstract planOptions(run: ThroughputRun): PlanOptions;

  /** Capital to keep after buying `offer` (for interest). */
  protected reserve(_run: ThroughputRun, _offer?: Offer): number {
    return 0;
  }

  /** True to spend a reroll on this visit's stock. */
  protected wantsReroll(_run: ThroughputRun, _rerollsSoFar: number): boolean {
    return false;
  }

  /** Deck card for a Tooling Upgrade, or null to skip it: a Boutique (+5 cap), else an Influencer, else a Sketch. */
  protected upgradeTarget(run: ThroughputRun): number | null {
    return indexOf(run, (c) => c.def.id === 'boutique') ?? indexOf(run, (c) => c.def.id === 'influencer') ?? indexOf(run, (c) => c.def.stage === 'design');
  }

  /**
   * Category and option for an R&D Grant, or null to skip it: by default the best-selling Category,
   * Scaled if its Demand ran out in at least half the rounds so far, else Premium.
   */
  protected grantTarget(run: ThroughputRun): { category: Category; option: GrantOption } | null {
    const category = this.bestSeller();
    const grant = run.config.grant;
    // Scale's extra Units beat Premium's price rise on Ships smaller than scaleUnits / premiumStep.
    return { category, option: this.unitsPerShip(category) * grant.premiumStep < grant.scaleUnits ? 'scale' : 'premium' };
  }

  /** Deck card for a Clone, or null to skip it: an Influencer, else a Rebrand, else the most-grown Design. */
  protected cloneTarget(run: ThroughputRun): number | null {
    return indexOf(run, (c) => c.def.id === 'influencer') ?? indexOf(run, (c) => c.def.id === 'rebrand') ?? bestIndex(run, (c) => (c.def.stage === 'design' ? 1 + c.growth : 0));
  }

  /** Deck card for Downsizing, or null to skip it. */
  protected downsizeTarget(run: ThroughputRun): number | null {
    return indexOf(run, (c) => c.def.id === 'workshop');
  }

  override shiftTurn(run: ThroughputRun): ShiftDecision {
    this.observe(run);
    const key = `${run.round}/${run.shift}`;
    if (this.retooledAt !== key) {
      this.retooledAt = key;
      const slots = scrapChoice(run);
      if (slots.length > 0) return { kind: 'scrap', slots };
      const hand = retoolChoice(run);
      if (hand.length > 0) return { kind: 'retool', hand };
    }
    const placements = planLoad(run, this.planOptions(run));
    return placements.length > 0 ? { kind: 'load', placements } : { kind: 'run' };
  }

  override shopTurn(run: ThroughputRun): ShopDecision {
    this.observe(run);
    if (this.visit !== run.round) {
      this.visit = run.round;
      this.rerollsThisVisit = 0;
    }
    let best: { offer: number; target: BuyTarget; want: number } | null = null;
    for (const [i, offer] of run.offers.entries()) {
      if (offer === null || run.wallet.cash - offer.price < this.reserve(run, offer)) continue;
      const want = this.want(offer, run);
      const target = want > 0 ? this.targetFor(offer, run) : null;
      if (target === null || run.whyCannotBuy(i, target) !== null) continue;
      if (best === null || want > best.want) best = { offer: i, target, want };
    }
    if (best !== null) return { kind: 'buy', offer: best.offer, target: best.target };
    const replace = this.fixtureToReplace(run);
    if (replace !== null) return { kind: 'sellFixture', slot: replace };
    const dodge = dodgeWeld(run);
    if (dodge !== null) return { kind: 'move', ...dodge };
    if (run.whyCannotReroll() === null && this.wantsReroll(run, this.rerollsThisVisit)) {
      this.rerollsThisVisit++;
      return { kind: 'reroll' };
    }
    return { kind: 'leave' };
  }

  override archetypeOf(run: ThroughputRun): string {
    return classifyBuild(run);
  }

  /**
   * With every slot holding a Fixture, a slot whose Fixture is worth selling to make room for a
   * clearly more wanted Fixture on offer (affordable after the refund), else null.
   */
  private fixtureToReplace(run: ThroughputRun): number | null {
    if (run.line.some((s) => s.fixture === null)) return null;
    let worst: { slot: number; want: number; refund: number } | null = null;
    for (const [slot, state] of run.line.entries()) {
      if (state.fixture === null) continue;
      const want = this.want({ kind: 'fixture', def: state.fixture.def, price: state.fixture.paid }, run);
      if (worst === null || want < worst.want) worst = { slot, want, refund: Math.floor(state.fixture.paid * run.config.sellRate) };
    }
    if (worst === null) return null;
    const upgrade = run.offers.some(
      (offer) =>
        offer?.kind === 'fixture' &&
        this.want(offer, run) >= worst.want + REPLACE_MARGIN &&
        run.wallet.cash + worst.refund - offer.price >= this.reserve(run, offer),
    );
    return upgrade ? worst.slot : null;
  }

  private targetFor(offer: Offer, run: ThroughputRun): BuyTarget | null {
    switch (offer.kind) {
      case 'fixture': {
        const slot = preferredSlot(offer.def, run);
        return slot === null ? null : { slot };
      }
      case 'card':
        return {};
      case 'contract': {
        if (offer.def.targetsCategory) return this.grantTarget(run);
        if (!offer.def.targetsCard) return {};
        const deckCard =
          offer.def.effect === 'tooling' ? this.upgradeTarget(run) : offer.def.effect === 'clone' ? this.cloneTarget(run) : this.downsizeTarget(run);
        return deckCard === null ? null : { deckCard };
      }
    }
  }
}

/** Baseline: buys the priciest thing it can afford every visit, no plan. */
export class GreedyBot extends StrategyBot {
  readonly name = 'greedy';

  protected override want(offer: Offer): number {
    return offer.price;
  }

  protected override planOptions(): PlanOptions {
    return { designPersistence: 0.5 };
  }
}

/** Early tempo: Overtime Crews, Assembly Line, Factory Floors and Export Deal; spends everything. */
export class MassMarketBot extends StrategyBot {
  readonly name = 'mass-market';

  protected override want(offer: Offer, run: ThroughputRun): number {
    const wants: Record<string, number> = {
      superstore: 12,
      'logistics-hub': 11,
      'overtime-crew': 10,
      'assembly-line': 9,
      megafactory: 9,
      'robotics-cell': 9,
      'factory-floor': 8,
      'contract-manufacturer': 8,
      'export-deal': 7,
      automation: 6,
      warehouse: 6,
      'conveyor-belt': 6,
      marketplace: 6,
      'floor-expansion': 5,
      'cross-dock': 5,
      'packaging-line': 4,
      'tooling-upgrade': 4,
      'rnd-grant': 3,
      'training-program': 3,
      showroom: 3,
    };
    if (SELL_ALL.includes(offer.def.id) && SELL_ALL.reduce((n, id) => n + countCards(run, id), 0) >= 2) return 0;
    return wants[offer.def.id] ?? 0;
  }

  protected override upgradeTarget(run: ThroughputRun): number | null {
    return indexOf(run, (c) => c.def.stage === 'make');
  }

  protected override planOptions(): PlanOptions {
    // A Make on the Warehouse also stocks its Units for the next Board Review.
    return { designPersistence: 0.3, bias: (card, slot, run) => (card.def.stage === 'make' && run.line[slot]?.fixture?.def.id === 'warehouse' ? 3 * makeUnits(card) : 0) };
  }
}

/**
 * Slow burn: banks Capital for interest through Year 1 (except for compounding pieces), parks the
 * same Sketch on an R&D Lab, then buys multiplicative scaling: Flagship, Robot Arm, Influencer, Gun.
 */
export class RndCompounderBot extends StrategyBot {
  readonly name = 'rnd-compounder';

  protected override want(offer: Offer, run: ThroughputRun): number {
    const owned = (id: string) => run.line.some((s) => s.fixture?.def.id === id);
    switch (offer.def.id) {
      case 'rnd-lab':
        return owned('rnd-lab') ? 0 : 20;
      case 'patent-office':
        return owned('patent-office') ? 0 : 15;
      case 'clone':
        return 9;
      case 'design-studio':
      case 'rebrand':
      case 'treasury-bond':
        return 6;
      case 'lean-cell':
        return owned('lean-cell') ? 0 : 5;
      case 'prototype':
        return 4;
      case 'flagship-store':
        return 12;
      case 'robot-arm':
        return 11;
      case 'influencer':
        return 8;
      case 'floor-expansion':
        return 7;
      case 'rnd-grant':
        return 5;
      case 'quality-lab':
        return 6;
      case 'price-gun':
        return owned('price-gun') ? 0 : 6;
      case 'showroom':
      case 'boutique':
        return 5;
      case 'overtime-crew':
        return 4;
      case 'tooling-upgrade':
        return owned('rnd-lab') ? 5 : 0;
      case 'downsizing':
        return run.deck.length > 16 ? 3 : 0;
      default:
        return 0;
    }
  }

  /** Bank 15C through Year 1 and 5C after, but never let interest stop a compounding buy. */
  protected override reserve(run: ThroughputRun, offer?: Offer): number {
    if (offer !== undefined && COMPOUNDERS.has(offer.def.id)) return 0;
    return run.quarter.year === 1 ? 15 : 5;
  }

  protected override wantsReroll(run: ThroughputRun, rerollsSoFar: number): boolean {
    const hunting = !run.line.some((s) => s.fixture?.def.id === 'rnd-lab');
    return hunting && run.quarter.year > 1 && rerollsSoFar < 2 && run.wallet.cash >= run.rerollCost + 8;
  }

  /** Upgrade the Design that has grown most (the one living on the R&D Lab). */
  protected override upgradeTarget(run: ThroughputRun): number | null {
    return bestIndex(run, (c) => (c.def.stage === 'design' ? 1 + c.growth : 0));
  }

  /** Thin the deck so the R&D Sketch turns up: drop Workshops, then Trucks, keeping enough to make and ship. */
  protected override downsizeTarget(run: ThroughputRun): number | null {
    if (countStage(run, 'make') > 5) return indexOf(run, (c) => c.def.id === 'workshop');
    if (countStage(run, 'ship') > 4) return indexOf(run, (c) => c.def.id === 'truck');
    return null;
  }

  protected override planOptions(): PlanOptions {
    return {
      designPersistence: 0.7,
      // Park the most-grown Design on the R&D Lab: its growth is worth more than this Shift shows.
      bias: (card, slot, run) => (card.def.stage === 'design' && run.line[slot]?.fixture?.def.id === 'rnd-lab' ? 40 * (1 + card.growth) : 0),
    };
  }
}

/** Items the slow-burn bot buys even while banking for interest. */
const COMPOUNDERS = new Set(['rnd-lab', 'flagship-store', 'robot-arm']);

/**
 * Rides the Market: Boutiques in the Categories turning Hot or Emerging next, margin pieces that
 * Hot's ×2 multiplies, and R&D Grants that Scale next round's Emerging Category so its Demand is
 * deep when it turns Hot. Ships Emerging goods for the Demand they grow.
 */
export class TrendSurferBot extends StrategyBot {
  readonly name = 'trend-surfer';

  protected override want(offer: Offer, run: ThroughputRun): number {
    const next = run.trends[run.round] ?? run.trendsNow;
    if (offer.kind === 'card') {
      if (offer.def.id === 'influencer') return 7;
      const stage = next[offer.category];
      if (stage !== 'hot' && stage !== 'emerging') return 0;
      return ({ boutique: 8, 'pop-up-shop': 8, 'subscription-box': 6, marketplace: 5 } as Record<string, number>)[offer.def.id] ?? 4;
    }
    const wants: Record<string, number> = {
      'flagship-store': 9,
      'robot-arm': 8,
      'ad-campaign': 8,
      'luxury-counter': 8,
      'floor-expansion': 7,
      'rnd-grant': 6,
      'express-lane': 6,
      'signature-line': 3,
      'lean-cell': 4,
      'packaging-line': 4,
      'quality-lab': 6,
      showroom: 5,
      'overtime-crew': 5,
      'brand-manager': 4,
      'tooling-upgrade': 3,
      downsizing: 3,
    };
    return wants[offer.def.id] ?? 0;
  }

  /** Scale the Category that is Emerging next round (Hot the round after), else the one Hot next. */
  protected override grantTarget(run: ThroughputRun): { category: Category; option: GrantOption } | null {
    const next = run.trends[run.round] ?? run.trendsNow;
    const category = CATEGORIES.find((c) => next[c] === 'emerging') ?? hotNext(run);
    return category === undefined ? null : { category, option: 'scale' };
  }

  /** Upgrade a Boutique in next round's Hot Category, else as usual. */
  protected override upgradeTarget(run: ThroughputRun): number | null {
    const hot = hotNext(run);
    return indexOf(run, (c) => c.def.id === 'boutique' && c.category === hot) ?? super.upgradeTarget(run);
  }

  /** Drop a starter card of next round's Saturated Category. */
  protected override downsizeTarget(run: ThroughputRun): number | null {
    const next = run.trends[run.round] ?? run.trendsNow;
    return indexOf(run, (c) => c.paid === 0 && next[c.category] === 'saturated' && c.def.stage !== 'design');
  }

  protected override planOptions(run: ThroughputRun): PlanOptions {
    const trends = run.trendsNow;
    return {
      designPersistence: 0.5,
      // Emerging sales grow Demand for good: shipping an Emerging Category is worth more than today's sale.
      bias: (card) => (card.def.stage === 'ship' && trends[card.category] === 'emerging' ? 15 : 0),
    };
  }
}

/**
 * Express Lane burst (playtest 3's dominant family): hunts an Express Lane, then stacks what a
 * Shift-1 Ship on it multiplies: Design ×s and Robot Arm, Marketplace, Premium.
 */
export class ExpressBurstBot extends StrategyBot {
  readonly name = 'express-burst';

  protected override want(offer: Offer, run: ThroughputRun): number {
    if (offer.def.id === 'express-lane') return ownsFixture(run, 'express-lane') ? 0 : 30;
    const wants: Record<string, number> = {
      'robot-arm': 12,
      marketplace: 10,
      influencer: 10,
      'design-studio': 9,
      'quality-lab': 8,
      rebrand: 8,
      'floor-expansion': 8,
      'rnd-grant': 7,
      clone: 6,
      'flagship-store': 6,
      'ad-campaign': 5,
      boutique: 4,
      prototype: 4,
      'overtime-crew': 4,
      showroom: 4,
      'training-program': 3,
    };
    return wants[offer.def.id] ?? 0;
  }

  /** Premium on the best seller: Express Lane multiplies price, not Units. */
  protected override grantTarget(): { category: Category; option: GrantOption } | null {
    return { category: this.bestSeller(), option: 'premium' };
  }

  /** Hunt the Lane from the first shop, keeping enough for a buy. */
  protected override wantsReroll(run: ThroughputRun, rerollsSoFar: number): boolean {
    return !ownsFixture(run, 'express-lane') && rerollsSoFar < 2 && run.wallet.cash >= run.rerollCost + 6;
  }

  protected override planOptions(): PlanOptions {
    return { designPersistence: 0.5 };
  }
}

/** Fixtures that multiply a Batch's Units (Stations) or a Make's (Robotics Cell). */
const UNIT_MULTIPLIERS: readonly string[] = ['megafactory', 'assembly-line', 'robotics-cell'];
/** Ship cards that sell every Unit, ignoring Demand. */
const SELL_ALL: readonly string[] = ['export-deal', 'wholesale-club'];

/**
 * Station × Station volume into a sell-all Ship (playtest 3's other dominant family): Robotics
 * Cell, Megafactory and Assembly Line multiply Units; Price Gun, Hub and Flagship price them, and
 * Export Deal sells them all.
 */
export class StationVolumeBot extends StrategyBot {
  readonly name = 'station-volume';

  protected override want(offer: Offer, run: ThroughputRun): number {
    const wants: Record<string, number> = {
      megafactory: 20,
      'assembly-line': 16,
      'robotics-cell': 15,
      'export-deal': 12,
      'price-gun': ownsFixture(run, 'price-gun') ? 0 : 10,
      'logistics-hub': 9,
      'flagship-store': 9,
      superstore: 8,
      'floor-expansion': 8,
      'overtime-crew': 7,
      'contract-manufacturer': 6,
      'rnd-grant': 6,
      '3d-printer': 5,
      'factory-floor': 5,
      automation: 4,
    };
    if (SELL_ALL.includes(offer.def.id) && SELL_ALL.reduce((n, id) => n + countCards(run, id), 0) >= 2) return 0;
    return wants[offer.def.id] ?? 0;
  }

  protected override upgradeTarget(run: ThroughputRun): number | null {
    return indexOf(run, (c) => c.def.stage === 'make');
  }

  /** Hunt for a second Units multiplier. */
  protected override wantsReroll(run: ThroughputRun, rerollsSoFar: number): boolean {
    const multipliers = run.line.filter((s) => UNIT_MULTIPLIERS.includes(s.fixture?.def.id ?? '')).length;
    return multipliers < 2 && rerollsSoFar < 2 && run.wallet.cash >= run.rerollCost + 6;
  }

  protected override planOptions(): PlanOptions {
    return { designPersistence: 0.3 };
  }
}

/**
 * Skimmer (round 3's one working skim line: Luxury Counter + Boutique): few Units, many Designs, and
 * capped Ships that sell them at big per-sale multipliers.
 */
export class SkimmerBot extends StrategyBot {
  readonly name = 'skimmer';

  protected override want(offer: Offer, run: ThroughputRun): number {
    const wants: Record<string, number> = {
      'luxury-counter': ownsFixture(run, 'luxury-counter') ? 6 : 20,
      boutique: countCards(run, 'boutique') >= 2 ? 3 : 14,
      'lean-cell': ownsFixture(run, 'lean-cell') ? 0 : 12,
      'packaging-line': ownsFixture(run, 'packaging-line') ? 0 : 9,
      'pop-up-shop': countCards(run, 'pop-up-shop') >= 2 ? 0 : 10,
      'subscription-box': 5,
      influencer: 11,
      'robot-arm': 10,
      'quality-lab': 9,
      'design-studio': 9,
      rebrand: 8,
      'floor-expansion': 8,
      'flagship-store': 7,
      'rnd-grant': 7,
      clone: 6,
      showroom: 5,
      'signature-line': 4,
      prototype: 4,
      'training-program': 3,
    };
    return wants[offer.def.id] ?? 0;
  }

  /** Premium on the best seller: skim sells few Units at a high price. */
  protected override grantTarget(): { category: Category; option: GrantOption } | null {
    return { category: this.bestSeller(), option: 'premium' };
  }

  /** A Design, never a Boutique: Luxury Counter wants caps of 8 or less. */
  protected override upgradeTarget(run: ThroughputRun): number | null {
    return indexOf(run, (c) => c.def.id === 'influencer') ?? indexOf(run, (c) => c.def.stage === 'design');
  }

  protected override planOptions(): PlanOptions {
    return { designPersistence: 0.5 };
  }
}

/** One of each strategy, in report order. */
export function throughputBots(): ThroughputBot[] {
  return [new GreedyBot(), new MassMarketBot(), new RndCompounderBot(), new TrendSurferBot(), new ExpressBurstBot(), new StationVolumeBot(), new SkimmerBot()];
}

function ownsFixture(run: ThroughputRun, id: string): boolean {
  return run.line.some((s) => s.fixture?.def.id === id);
}

/** Next round's boss welds a slot holding a Fixture: move it to a free slot (bosses are telegraphed). */
function dodgeWeld(run: ThroughputRun): { from: number; to: number } | null {
  const boss = run.bossOf(run.round + 1);
  if (boss === null) return null;
  const from = run.line.findIndex((slot, i) => slot.fixture !== null && boss.isWelded(i));
  const to = run.line.findIndex((slot, i) => slot.fixture === null && !boss.isWelded(i));
  if (from < 0 || to < 0 || run.whyCannotMove(from, to) !== null) return null;
  return { from, to };
}

function indexOf(run: ThroughputRun, test: (card: Card) => boolean): number | null {
  const i = run.deck.findIndex(test);
  return i < 0 ? null : i;
}

function bestIndex(run: ThroughputRun, score: (card: Card) => number): number | null {
  let best: { index: number; score: number } | null = null;
  for (const [index, card] of run.deck.entries()) {
    const value = score(card);
    if (value > 0 && (best === null || value > best.score)) best = { index, score: value };
  }
  return best?.index ?? null;
}

function countCards(run: ThroughputRun, id: string): number {
  return run.deck.filter((c) => c.def.id === id).length;
}

function countStage(run: ThroughputRun, stage: Card['def']['stage']): number {
  return run.deck.filter((c) => c.def.stage === stage).length;
}

function hotNext(run: ThroughputRun): Category | undefined {
  const next = run.trends[run.round] ?? run.trendsNow;
  return (Object.keys(next) as Category[]).find((c) => next[c] === 'hot');
}
