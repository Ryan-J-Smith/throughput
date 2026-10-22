import type { Rng } from '../../../engine/rng';
import type { PartCategory, RndChoice } from '../model';
import type { BomRun } from '../rules';
import { BomBot } from './bom-bot';
import type { BomShopDecision, BuildDecision } from './bom-bot';
import { bestShip, planFab, scrapPlan } from './planner';

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
  /** Facility ids to buy, best first. Empty with `buyAnything` = take whatever is affordable. */
  readonly facilities: readonly string[];
  readonly blueprints: readonly string[];
  /** Buy any affordable Rack Facility or Blueprint (the greedy baseline). */
  readonly buyAnything?: boolean;
  /** R&D targets, best first, with the Product choice. */
  readonly rnd: readonly { readonly id: string; readonly choice?: RndChoice }[];
  /** Parts Counter categories worth buying. */
  readonly counter: readonly PartCategory[];
  /** Deck parts to Shred, best first. */
  readonly shred: readonly (readonly [PartCategory, number])[];
  /** Subs to fabricate proactively (Bench stocking); others only when nothing can ship. */
  readonly fabricate: readonly string[];
  /** Spend Overtime Builds fabricating instead of collecting $1. */
  readonly overtimeFab: boolean;
  /** Cash to keep for interest; purchases (other than its top priorities) never dip below it. */
  readonly reserve: number;
  /** Rerolls per shop visit when nothing wanted is on offer. */
  readonly rerolls: number;
};

/**
 * A heuristic bot driven by a Strategy: ships the best available Product (greedy filler), stocks
 * the Bench with its preferred Subs when Builds allow, and shops by priority lists.
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
    const s = this.strategy;
    if (run.phase === 'overtime') {
      // Stocking for next round is wasted if the revealed Boss disruption empties the Bench.
      const burns = run.round.market === 'big' && run.revealedDisruption(run.round.quarter)?.id === 'warehouse-fire';
      if (s.overtimeFab && !burns) {
        const fab = this.preferredFab(run, false);
        if (fab !== null) return fab;
      }
      return { action: 'collect' };
    }

    const need = run.round.target - run.revenue;
    const ship = bestShip(run);
    if (ship !== null && ship.revenue >= need) return { action: 'ship', product: ship.blueprint.id, parts: ship.parts };

    // Make a missing Sub part an owned Product needs, if a Ship can still follow.
    if (run.buildsLeft >= 2) {
      const fab = this.enablingFab(run);
      if (fab !== null) return fab;
    }

    // Stock the Bench while there are Builds to spare (never trashing a stocked part).
    if (s.fabricate.length > 0 && run.buildsLeft >= 3) {
      const fab = this.preferredFab(run, false);
      if (fab !== null) return fab;
    }

    // Dig with Scraps when the best Ship is far behind the pace the round needs.
    if (run.scrapsLeft > 0 && (ship === null || ship.revenue * run.buildsLeft < need * 0.8)) {
      const parts = scrapPlan(run, ship?.parts ?? []);
      if (parts.length > 0) return { action: 'scrap', parts };
    }

    if (ship !== null) return { action: 'ship', product: ship.blueprint.id, parts: ship.parts };
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

    // Rack: wanted Facilities and Blueprints by priority (top choices ignore the reserve).
    for (let slot = 0; slot < offers.length; slot++) {
      const offer = offers[slot];
      if (offer == null || run.offerProblem(slot) !== null) continue;
      if (offer.kind === 'facility') {
        const rank = s.facilities.indexOf(offer.facility.id);
        if ((rank >= 0 || s.buyAnything) && affordable(slot, rank >= 0 && rank < 2)) return { action: 'buy', slot };
      }
      if (offer.kind === 'blueprint') {
        const rank = s.blueprints.indexOf(offer.blueprint.id);
        if ((rank >= 0 || s.buyAnything) && affordable(slot, rank === 0)) return { action: 'buy', slot };
      }
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

  private preferredFab(run: BomRun, allowTrash: boolean): BuildDecision | null {
    for (const id of this.strategy.fabricate) {
      const sub = run.blueprint(id);
      if (sub === undefined) continue;
      const fab = planFab(run, sub, allowTrash && run.bench.length > 0);
      if (fab !== null) return { action: 'fab', parts: fab.parts, ...(fab.trash ? { trash: fab.trash } : {}) };
    }
    return null;
  }

  /** Fabricates a Sub output that some owned Product's recipe needs and hand + Bench lack. */
  private enablingFab(run: BomRun): BuildDecision | null {
    const available = [...run.hand, ...run.bench];
    for (const product of run.blueprints) {
      if (product.def.kind !== 'product') continue;
      for (const category of new Set(product.def.recipe)) {
        const needed = product.def.recipe.filter((c) => c === category).length;
        if (available.filter((p) => p.category === category).length >= needed) continue;
        const sub = run.blueprints.find((b) => b.def.kind === 'sub' && b.def.output === category);
        const fab = sub === undefined ? null : planFab(run, sub, false);
        if (fab !== null) return { action: 'fab', parts: fab.parts };
      }
    }
    return null;
  }
}
