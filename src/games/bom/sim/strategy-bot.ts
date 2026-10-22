import type { Rng } from '../../../engine/rng';
import type { OwnedBlueprint, PartCategory, RndChoice } from '../model';
import type { BomRun, RackOffer } from '../rules';
import { BomBot } from './bom-bot';
import type { BomShopDecision, BuildDecision } from './bom-bot';
import { firstStep, planFab, scrapPlan, shipPlans, stockFab } from './planner';
import type { ShipPlan } from './planner';

/** Key facilities per archetype (design doc §4); a run is labelled by what it actually built. */
export const ARCHETYPE_KEYS: readonly { readonly archetype: string; readonly facilities: readonly string[] }[] = [
  { archetype: 'bargain-bin', facilities: ['flagship-store', 'discount-warehouse', 'paint-shop'] },
  { archetype: 'assembly-chain', facilities: ['precision-tooling', 'kitting-station', 'stockroom'] },
  { archetype: 'market-maker', facilities: ['conveyor-belt', 'viral-marketing', 'continuous-production'] },
  { archetype: 'boutique', facilities: ['lean-line', 'patent-office'] },
  { archetype: 'catalog', facilities: ['product-catalog', 'market-research'] },
];

/** Archetype whose key facilities the run owns most of (at least 2), else "unbuilt". */
export function classifyRun(run: BomRun): string {
  const owned = new Set(run.facilities.map((f) => f.id));
  let best = { archetype: 'unbuilt', count: 1 };
  for (const { archetype, facilities } of ARCHETYPE_KEYS) {
    const count = facilities.filter((f) => owned.has(f)).length;
    if (count > best.count) best = { archetype, count };
  }
  return best.archetype;
}

export type Strategy = {
  readonly name: string;
  /**
   * Facility and Blueprint ids to buy, best first (the top 3 ignore the cash reserve). Blueprint order
   * is also the Bench-stocking priority; owned blueprints not listed may be sold to make room.
   */
  readonly wants: readonly string[];
  /** Buy any affordable Rack Facility or Blueprint (the greedy baseline). */
  readonly buyAnything?: boolean;
  /** R&D targets, best first, with the Product choice. */
  readonly rnd: readonly { readonly id: string; readonly choice?: RndChoice }[];
  /** Parts Counter categories worth buying. */
  readonly counter: readonly PartCategory[];
  /** Deck parts to Shred, best first. */
  readonly shred: readonly (readonly [PartCategory, number])[];
  /** Spend Overtime Builds stocking the Bench for next round instead of collecting $1 each. */
  readonly overtimeFab: boolean;
  /** In Overtime, Ship for cash before stocking the Bench ("cash"), or after it ("stock"). */
  readonly overtimePriority: 'cash' | 'stock';
  /** Cash to keep for interest; purchases (other than its top priorities) never dip below it. */
  readonly reserve: number;
  /** Rerolls per shop visit when nothing wanted is on offer. */
  readonly rerolls: number;
};

const baseValue = (b: OwnedBlueprint): number => (b.def.kind === 'product' ? b.def.units * b.def.price : 0);

/**
 * A heuristic bot driven by a Strategy.
 * - Round: take the cheapest plan that clears the target (fewest Builds, least WIP), else the plan
 *   with the best revenue per Build; plans may Fabricate missing Sub parts first. Scrap when far behind.
 * - Overtime: stock the Bench toward its Products' recipes (if the Strategy says so).
 * - Shop: buy by priority lists, selling unwanted blueprints or facilities to make room.
 */
export class StrategyBot extends BomBot {
  readonly name: string;
  readonly strategy: Strategy;
  private rerollsThisVisit = 0;
  private visit = -1;

  constructor(strategy: Strategy) {
    super();
    this.strategy = strategy;
    this.name = strategy.name;
  }

  override beginRun(_run: BomRun, _rng: Rng): void {
    this.visit = -1;
  }

  override archetypeOf(run: BomRun): string {
    return classifyRun(run);
  }

  override buildTurn(run: BomRun): BuildDecision {
    // Before a revealed Warehouse Fire, WIP left after the Big round burns: spend it, don't stock.
    const burns = run.round.market === 'big' && run.revealedDisruption(run.round.quarter)?.id === 'warehouse-fire';
    if (run.phase === 'overtime') {
      const stock = this.strategy.overtimeFab && !burns ? stockFab(run, this.productPriority(run)) : null;
      const cash = this.cashShip(run, burns);
      if (this.strategy.overtimePriority === 'cash' && cash !== null) return cash;
      if (stock !== null) return { action: 'fab', parts: stock.parts };
      return cash ?? { action: 'collect' };
    }

    const need = run.round.target - run.revenue;
    const plans = shipPlans(run);
    // Overshooting the target earns nothing, so clear it as cheaply as possible.
    const clearing = plans.filter((p) => p.quote.revenue >= need);
    if (clearing.length > 0) {
      clearing.sort((a, b) => a.builds - b.builds || (burns ? b.benchUsed - a.benchUsed : a.benchUsed - b.benchUsed) || b.quote.revenue - a.quote.revenue);
      return firstStep(clearing[0] as ShipPlan);
    }

    const rate = (p: ShipPlan): number => p.quote.revenue / p.builds;
    const best = plans.reduce<ShipPlan | null>((a, p) => (a === null || rate(p) > rate(a) ? p : a), null);
    // Dig with Scraps when the best pace can't reach the target.
    if (run.scrapsLeft > 0 && (best === null || rate(best) * run.buildsLeft < need * 0.8)) {
      const keep = best === null ? [] : [...best.quote.parts, ...best.fabs.flatMap((f) => f.inputs)];
      const parts = scrapPlan(run, keep);
      if (parts.length > 0) return { action: 'scrap', parts };
    }
    if (best !== null) return firstStep(best);

    for (const sub of run.blueprints) {
      const fab = planFab(run, sub, true);
      if (fab !== null) return { action: 'fab', parts: fab.parts, ...(fab.trash ? { trash: fab.trash } : {}) };
    }
    // Only reachable if the rules failed to end a stuck round.
    throw new Error('no legal Build');
  }

  override shopTurn(run: BomRun): BomShopDecision {
    const s = this.strategy;
    if (this.visit !== run.round.index) {
      this.visit = run.round.index;
      this.rerollsThisVisit = 0;
    }
    const cash = run.wallet.cash;
    const offers = run.shop.offers;
    const affordable = (slot: number, top: boolean): boolean => {
      const offer = offers[slot];
      return offer != null && cash - offer.cost >= (top ? 0 : s.reserve);
    };

    // Rack: the best-ranked wanted Facility or Blueprint (top choices ignore the reserve).
    let pick: { slot: number; rank: number } | null = null;
    for (let slot = 0; slot < offers.length; slot++) {
      const offer = offers[slot];
      if (offer == null || (offer.kind !== 'facility' && offer.kind !== 'blueprint')) continue;
      const found = s.wants.indexOf(offer.kind === 'facility' ? offer.facility.id : offer.blueprint.id);
      const rank = found >= 0 ? found : s.buyAnything === true ? s.wants.length : -1;
      if (rank < 0 || !affordable(slot, rank < 3) || (pick !== null && pick.rank <= rank)) continue;
      if (offer.kind === 'blueprint' && offer.blueprint.kind === 'sub' && !this.hasUse(run, offer.blueprint.output)) continue;
      const problem = run.offerProblem(slot);
      if (problem === null || (found >= 0 && /slots full/.test(problem) && this.makeRoom(run, offer.kind) !== null)) pick = { slot, rank };
    }
    if (pick !== null) {
      const offer = offers[pick.slot] as RackOffer;
      if (run.offerProblem(pick.slot) === null) return { action: 'buy', slot: pick.slot };
      return { action: 'sell', id: this.makeRoom(run, offer.kind === 'facility' ? 'facility' : 'blueprint') as string };
    }
    // R&D Grants on the first owned preferred target.
    for (let slot = 0; slot < offers.length; slot++) {
      if (offers[slot]?.kind !== 'rnd' || !affordable(slot, false)) continue;
      const target = s.rnd.find((t) => run.blueprint(t.id) !== undefined);
      if (target !== undefined) {
        const choice = run.blueprint(target.id)?.def.kind === 'product' ? (target.choice ?? 'premium') : undefined;
        const t = { blueprintId: target.id, ...(choice ? { choice } : {}) };
        if (run.whyCannotBuy(slot, t) === null) return { action: 'buy', slot, target: t };
      }
    }
    // Parts Counter.
    for (let slot = 0; slot < offers.length; slot++) {
      const offer = offers[slot];
      if (offer?.kind === 'part' && s.counter.includes(offer.part.category) && affordable(slot, false)) return { action: 'buy', slot };
    }
    // Shred.
    if (cash - run.config.shop.shredCost >= s.reserve) {
      const target = s.shred.find(([c, g]) => run.whyCannotShred(c, g) === null);
      if (target !== undefined) return { action: 'shred', category: target[0], grade: target[1] };
    }
    // Reroll when the Rack shows nothing wanted and there is room to grow.
    if (
      this.rerollsThisVisit < s.rerolls &&
      run.facilities.length < run.config.shop.maxFacilities &&
      run.whyCannotReroll() === null &&
      cash - run.shop.rerollCost >= s.reserve
    ) {
      this.rerollsThisVisit++;
      return { action: 'reroll' };
    }
    return { action: 'leave' };
  }

  /**
   * The best one-Build Overtime Ship for cash, if it pays at least $2 (it uses a Build that collect
   * would pay $1 for). Bench WIP is kept for next round unless a Warehouse Fire will burn it.
   */
  private cashShip(run: BomRun, burns: boolean): BuildDecision | null {
    let best: { plan: ShipPlan; pay: number } | null = null;
    for (const plan of shipPlans(run)) {
      if (plan.builds !== 1 || (plan.benchUsed > 0 && !burns)) continue;
      const pay = run.overtimePayFor(plan.quote.revenue);
      if (best === null || pay > best.pay || (pay === best.pay && plan.quote.parts.length < best.plan.quote.parts.length)) best = { plan, pay };
    }
    return best !== null && best.pay >= 2 ? firstStep(best.plan) : null;
  }

  /** Owned Products, wanted ones first (in Strategy order), then by base Units × Price. */
  private productPriority(run: BomRun): OwnedBlueprint[] {
    const rank = (b: OwnedBlueprint): number => {
      const i = this.strategy.wants.indexOf(b.id);
      return i < 0 ? this.strategy.wants.length : i;
    };
    return run.blueprints.filter((b) => b.def.kind === 'product').sort((a, b) => rank(a) - rank(b) || baseValue(b) - baseValue(a));
  }

  /** Whether an owned Product (other than `except`) uses this Sub output. */
  private hasUse(run: BomRun, output: PartCategory, except?: string): boolean {
    return run.blueprints.some((b) => b.id !== except && b.def.kind === 'product' && b.def.recipe.includes(output));
  }

  /**
   * Something unwanted to sell for a wanted Rack item when slots are full: a Sub nothing uses, then the
   * lowest-value unwanted Product (keeping Subs fed), or the cheapest unwanted Facility.
   */
  private makeRoom(run: BomRun, kind: 'facility' | 'blueprint'): string | null {
    const s = this.strategy;
    if (kind === 'facility') {
      const spare = run.facilities.filter((f) => !s.wants.includes(f.id) && run.whyCannotSell(f.id) === null);
      return [...spare].sort((a, b) => a.cost - b.cost)[0]?.id ?? null;
    }
    const spare = run.blueprints.filter((b) => !s.wants.includes(b.id) && run.whyCannotSell(b.id) === null);
    const idleSub = spare.find((b) => b.def.kind === 'sub' && !this.hasUse(run, b.def.output));
    if (idleSub !== undefined) return idleSub.id;
    const products = spare.filter((b) => b.def.kind === 'product').sort((a, b) => baseValue(a) - baseValue(b));
    return products[0]?.id ?? null;
  }
}
