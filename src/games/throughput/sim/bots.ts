import type { Card, Category } from '../model';
import type { BuyTarget, Offer, ThroughputRun } from '../rules';
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

  /** Deck card for a Tooling Upgrade, or null to skip it. */
  protected upgradeTarget(run: ThroughputRun): number | null {
    return indexOf(run, (c) => c.def.stage === 'ship');
  }

  /** Deck card for Downsizing, or null to skip it. */
  protected downsizeTarget(run: ThroughputRun): number | null {
    return indexOf(run, (c) => c.def.id === 'workshop');
  }

  override shiftTurn(run: ThroughputRun): ShiftDecision {
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
        if (offer.def.effect === 'expand') return {};
        const deckCard = offer.def.effect === 'tooling' ? this.upgradeTarget(run) : this.downsizeTarget(run);
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

/** Early tempo: Overtime Crews, Assembly Line, Factory Floors and Wholesale Club; spends everything. */
export class MassMarketBot extends StrategyBot {
  readonly name = 'mass-market';

  protected override want(offer: Offer, run: ThroughputRun): number {
    const wants: Record<string, number> = {
      'overtime-crew': 10,
      'assembly-line': 9,
      'factory-floor': 8,
      'wholesale-club': 7,
      automation: 6,
      'floor-expansion': 5,
      'tooling-upgrade': 4,
      showroom: 3,
    };
    if (offer.def.id === 'wholesale-club' && countCards(run, 'wholesale-club') >= 2) return 0;
    return wants[offer.def.id] ?? 0;
  }

  protected override upgradeTarget(run: ThroughputRun): number | null {
    return indexOf(run, (c) => c.def.stage === 'make');
  }

  protected override planOptions(): PlanOptions {
    return { designPersistence: 0.3 };
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
      case 'flagship-store':
        return 12;
      case 'robot-arm':
        return 11;
      case 'influencer':
        return 8;
      case 'floor-expansion':
        return 7;
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

/** Rides the Market: buys cards in next round's Hot and Emerging Categories, ships Emerging goods for Equity. */
export class TrendSurferBot extends StrategyBot {
  readonly name = 'trend-surfer';

  protected override want(offer: Offer, run: ThroughputRun): number {
    const next = run.trends[run.round] ?? run.trendsNow;
    if (offer.kind === 'card') {
      const stage = next[offer.category];
      if (stage === 'hot' || stage === 'emerging') return offer.def.stage === 'ship' ? 8 : 6;
      return 0;
    }
    const wants: Record<string, number> = { 'flagship-store': 7, showroom: 6, 'quality-lab': 4, 'tooling-upgrade': 4, downsizing: 3 };
    return wants[offer.def.id] ?? 0;
  }

  /** Upgrade a Truck in next round's Hot Category, else any Ship. */
  protected override upgradeTarget(run: ThroughputRun): number | null {
    const hot = hotNext(run);
    return indexOf(run, (c) => c.def.stage === 'ship' && c.category === hot) ?? indexOf(run, (c) => c.def.stage === 'ship');
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
      // Equity is permanent: shipping an Emerging Category is worth more than today's sale.
      bias: (card) => (card.def.stage === 'ship' && trends[card.category] === 'emerging' ? 10 : 0),
    };
  }
}

/** One of each strategy, in report order. */
export function throughputBots(): ThroughputBot[] {
  return [new GreedyBot(), new MassMarketBot(), new RndCompounderBot(), new TrendSurferBot()];
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
