import type { OwnedBlueprint, Part, PartCategory } from '../model';
import { fabricate } from '../rules';
import type { BomRun, ShipQuote } from '../rules';
import type { BuildDecision } from './bom-bot';

/** Adds the filler part that raises revenue most, again and again, until none does or the selection is full. */
function addFiller(quoteOf: (parts: readonly Part[]) => ShipQuote | null, base: readonly Part[], filler: readonly Part[], max: number): ShipQuote | null {
  const picked = [...base];
  const pool = [...filler];
  let quote = quoteOf(picked);
  if (quote === null) return null;
  while (picked.length < max) {
    let bestQuote: ShipQuote | null = null;
    let bestIndex = -1;
    pool.forEach((p, i) => {
      const q = quoteOf([...picked, p]);
      if (q !== null && q.revenue > (bestQuote?.revenue ?? (quote as ShipQuote).revenue)) {
        bestQuote = q;
        bestIndex = i;
      }
    });
    if (bestQuote === null) break;
    picked.push(pool.splice(bestIndex, 1)[0] as Part);
    quote = bestQuote;
  }
  return quote;
}

function highestOf(parts: readonly Part[], category: PartCategory, taken: ReadonlySet<Part>): Part | undefined {
  let best: Part | undefined;
  for (const p of parts) if (p.category === category && !taken.has(p) && (best === undefined || p.grade > best.grade)) best = p;
  return best;
}

/**
 * The best Ship found for one Product from parts held now: recipe parts with the highest grades,
 * then greedy filler. Filler comes from the hand only: hand parts return next round, Bench parts are used up.
 */
export function planShip(run: BomRun, product: OwnedBlueprint, available: readonly Part[]): ShipQuote | null {
  const taken = new Set<Part>();
  for (const category of product.def.recipe) {
    const part = highestOf(available, category, taken);
    if (part === undefined) return null;
    taken.add(part);
  }
  const filler = available.filter((p) => !taken.has(p) && !run.bench.includes(p));
  return addFiller((parts) => run.quoteFor(product.id, parts), [...taken], filler, run.config.maxSelection);
}

export type FabStep = { readonly sub: OwnedBlueprint; readonly inputs: readonly Part[]; readonly trash?: Part };

/** A Ship of one Product, possibly after Fabricating the Sub parts it lacks. */
export type ShipPlan = {
  readonly product: OwnedBlueprint;
  /** Projected Ship (parts still to be fabricated included). */
  readonly quote: ShipQuote;
  readonly fabs: readonly FabStep[];
  /** Builds the plan uses, including the Ship. */
  readonly builds: number;
  /** Bench parts (WIP) the plan uses up. */
  readonly benchUsed: number;
};

/** True for categories only Fabricate makes (Motor, Board, Frame, …). */
function isFabricated(run: BomRun, category: PartCategory): boolean {
  return run.config.blueprints.some((b) => b.kind === 'sub' && b.output === category);
}

function ownedSubFor(run: BomRun, category: PartCategory): OwnedBlueprint | undefined {
  return run.blueprints.find((b) => b.def.kind === 'sub' && b.def.output === category);
}

/**
 * Plans a Ship of `product`: hand parts for the base recipe slots, Bench parts for Sub slots, and
 * Fabricate steps (highest-grade hand inputs) for Sub parts the Bench lacks. A full Bench trashes its
 * lowest-grade part the plan doesn't use. Null if the parts can't be found.
 */
export function planProduct(run: BomRun, product: OwnedBlueprint): ShipPlan | null {
  if (product.def.kind !== 'product') return null;
  const taken = new Set<Part>();
  const recipeParts: Part[] = [];
  const fabCategories: PartCategory[] = [];
  for (const category of product.def.recipe) {
    if (isFabricated(run, category)) {
      fabCategories.push(category);
      continue;
    }
    const part = highestOf(run.hand, category, taken);
    if (part === undefined) return null;
    taken.add(part);
    recipeParts.push(part);
  }

  const fabs: FabStep[] = [];
  let benchCount = run.bench.length;
  const trashed = new Set<Part>();
  for (const category of fabCategories) {
    const onBench = highestOf(run.bench, category, taken);
    if (onBench !== undefined) {
      taken.add(onBench);
      recipeParts.push(onBench);
      continue;
    }
    const sub = ownedSubFor(run, category);
    if (sub === undefined) return null;
    const inputs: Part[] = [];
    for (const input of sub.def.recipe) {
      const part = highestOf(run.hand, input, new Set([...taken, ...inputs]));
      if (part === undefined) return null;
      inputs.push(part);
    }
    inputs.forEach((p) => taken.add(p));
    let trash: Part | undefined;
    if (benchCount >= run.mods.benchSlots) {
      trash = [...run.bench].filter((p) => !taken.has(p) && !trashed.has(p)).sort((a, b) => a.grade - b.grade)[0];
      if (trash === undefined) return null;
      trashed.add(trash);
    } else {
      benchCount++;
    }
    fabs.push({ sub, inputs, ...(trash ? { trash } : {}) });
    recipeParts.push(fabricate(sub, inputs, run.activeRules).output);
  }

  const filler = run.hand.filter((p) => !taken.has(p));
  const quote = addFiller((parts) => run.projectShip(product.id, parts), recipeParts, filler, run.config.maxSelection);
  if (quote === null) return null;
  return { product, quote, fabs, builds: fabs.length + 1, benchUsed: quote.parts.filter((p) => run.bench.includes(p)).length };
}

/** Every owned Product's plan that fits in the Builds left. */
export function shipPlans(run: BomRun): ShipPlan[] {
  return run.blueprints.flatMap((b) => {
    const plan = planProduct(run, b);
    return plan !== null && plan.builds <= run.buildsLeft ? [plan] : [];
  });
}

/** The plan's next Build. */
export function firstStep(plan: ShipPlan): BuildDecision {
  const fab = plan.fabs[0];
  if (fab === undefined) return { action: 'ship', product: plan.product.id, parts: plan.quote.parts };
  return { action: 'fab', parts: fab.inputs, ...(fab.trash ? { trash: fab.trash } : {}) };
}

/** The highest-revenue Ship over all owned Products from parts held now, or null if none can ship. */
export function bestShip(run: BomRun, exclude: ReadonlySet<string> = new Set()): ShipQuote | null {
  const available = [...run.hand, ...run.bench];
  let best: ShipQuote | null = null;
  for (const b of run.blueprints) {
    if (b.def.kind !== 'product' || exclude.has(b.id)) continue;
    const q = planShip(run, b, available);
    if (q !== null && (best === null || q.revenue > best.revenue)) best = q;
  }
  return best;
}

export type FabPlan = { readonly sub: OwnedBlueprint; readonly parts: readonly Part[]; readonly trash?: Part };

/**
 * Highest-grade inputs for a Sub, preferring hand parts. With a full Bench the lowest-grade
 * Bench part is trashed, unless `allowTrash` is false.
 */
export function planFab(run: BomRun, sub: OwnedBlueprint, allowTrash: boolean): FabPlan | null {
  if (sub.def.kind !== 'sub') return null;
  const pool = [...run.hand].sort((a, b) => b.grade - a.grade);
  const parts: Part[] = [];
  for (const category of sub.def.recipe) {
    const i = pool.findIndex((p) => p.category === category);
    if (i < 0) return null;
    parts.push(pool.splice(i, 1)[0] as Part);
  }
  if (run.whyCannotFabricate(parts) === null) return { sub, parts };
  if (!allowTrash) return null;
  const trash = [...run.bench].sort((a, b) => a.grade - b.grade)[0];
  return trash !== undefined && run.whyCannotFabricate(parts, trash) === null ? { sub, parts, trash } : null;
}

/**
 * Bench stocking for the next round (Overtime): the first Sub part, by Product priority, that a
 * Product's recipe needs and the Bench lacks. Never trashes.
 */
export function stockFab(run: BomRun, productOrder: readonly OwnedBlueprint[]): FabPlan | null {
  for (const product of productOrder) {
    if (product.def.kind !== 'product') continue;
    const bench = [...run.bench];
    for (const category of product.def.recipe) {
      const i = bench.findIndex((p) => p.category === category);
      if (i >= 0) {
        bench.splice(i, 1);
        continue;
      }
      const sub = ownedSubFor(run, category);
      if (sub === undefined) continue;
      const fab = planFab(run, sub, false);
      if (fab !== null) return fab;
    }
  }
  return null;
}

/** Up to 3 hand parts least useful to owned recipes: off-recipe categories first, then low grades. */
export function scrapPlan(run: BomRun, keep: readonly Part[] = []): Part[] {
  const wanted = new Set(run.blueprints.flatMap((b) => b.def.recipe));
  return [...run.hand]
    .filter((p) => !keep.includes(p))
    .sort((a, b) => Number(wanted.has(a.category)) - Number(wanted.has(b.category)) || a.grade - b.grade)
    .slice(0, Math.min(run.config.maxSelection, 3));
}
