import type { OwnedBlueprint, Part } from '../model';
import type { BomRun, ShipQuote } from '../rules';

/**
 * The best Ship found for one Product: recipe parts with the highest grades, then greedy filler.
 * Filler comes from the hand only: hand parts return next round, Bench parts are used up.
 */
export function planShip(run: BomRun, product: OwnedBlueprint, available: readonly Part[]): ShipQuote | null {
  const pool = [...available];
  const picked: Part[] = [];
  for (const category of product.def.recipe) {
    let best = -1;
    pool.forEach((p, i) => {
      if (p.category === category && (best < 0 || p.grade > (pool[best] as Part).grade)) best = i;
    });
    if (best < 0) return null;
    picked.push(pool.splice(best, 1)[0] as Part);
  }
  let quote = run.quoteFor(product.id, picked);
  if (quote === null) return null;
  const filler = pool.filter((p) => !run.bench.includes(p));
  while (picked.length < run.config.maxSelection) {
    let bestQuote: ShipQuote | null = null;
    let bestIndex = -1;
    filler.forEach((p, i) => {
      const q = run.quoteFor(product.id, [...picked, p]);
      if (q !== null && q.revenue > (bestQuote?.revenue ?? (quote as ShipQuote).revenue)) {
        bestQuote = q;
        bestIndex = i;
      }
    });
    if (bestQuote === null) break;
    picked.push(filler.splice(bestIndex, 1)[0] as Part);
    quote = bestQuote;
  }
  return quote;
}

/** The highest-revenue Ship over all owned Products, or null if none can ship. */
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

/** Up to 5 hand parts least useful to owned recipes: off-recipe categories first, then low grades. */
export function scrapPlan(run: BomRun, keep: readonly Part[] = []): Part[] {
  const wanted = new Set(run.blueprints.flatMap((b) => b.def.recipe));
  return [...run.hand]
    .filter((p) => !keep.includes(p))
    .sort((a, b) => Number(wanted.has(a.category)) - Number(wanted.has(b.category)) || a.grade - b.grade)
    .slice(0, Math.min(run.config.maxSelection, 3));
}
