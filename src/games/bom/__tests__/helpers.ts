// Shared test helpers for BoM rules: build configured runs and play simple moves.
import { BLUEPRINTS, defaultBomConfig } from '../content';
import { makePart } from '../model';
import type { BlueprintDef, Part } from '../model';
import { BomRun, findRecipeParts } from '../rules';
import type { BomConfig } from '../rules';

/** The doc's Gizmo and Flatpack stats: rules tests keep their arithmetic when tuning moves the starters. */
const DOC_STARTERS: Readonly<Record<string, Partial<BlueprintDef>>> = {
  gizmo: { units: 8, price: 2, demand: 30 },
  flatpack: { units: 12, price: 2, demand: 40 },
};

export const FIXTURE_BLUEPRINTS: readonly BlueprintDef[] = BLUEPRINTS.map((b) => ({ ...b, ...(DOC_STARTERS[b.id] ?? {}) }) as BlueprintDef);

export function config(overrides: Partial<BomConfig> = {}): BomConfig {
  return { ...defaultBomConfig(), blueprints: FIXTURE_BLUEPRINTS, ...overrides };
}

/** Every target is `target`, so tests can clear rounds with any Ship. */
export function flatTargets(target: number): BomConfig['targets'] {
  return [0, 1, 2, 3].map(() => [target, target, target] as const);
}

export function runWith(overrides: Partial<BomConfig> = {}, seed = 1): BomRun {
  return new BomRun(config(overrides), seed);
}

/** A deck of `n` copies of each listed part (fresh objects per run). */
export function deckOf(...parts: [string, number][]): () => Part[] {
  return () => parts.map(([category, grade]) => makePart(category, grade));
}

export function pick(run: BomRun, category: string, grade?: number): Part {
  const part = [...run.hand, ...run.bench].find((p) => p.category === category && (grade === undefined || p.grade === grade));
  if (part === undefined) throw new Error(`no ${category} ${grade ?? ''} in hand or bench`);
  return part;
}

/** Ships the first Product whose recipe is available (scrapping to dig if needed); returns its id. */
export function shipAnything(run: BomRun): string {
  for (;;) {
    const available = [...run.hand, ...run.bench];
    for (const b of run.blueprints) {
      if (b.def.kind !== 'product') continue;
      const parts = findRecipeParts(b.def.recipe, available);
      if (parts !== null) {
        run.ship(parts, b.id);
        return b.id;
      }
    }
    if (run.scrapsLeft === 0) throw new Error('nothing to ship');
    run.scrap(run.hand.slice(0, 5));
  }
}

/** With tiny targets: clears the current round and stops in the shop (or at the end). */
export function clearRound(run: BomRun): void {
  shipAnything(run);
  if (run.phase === 'overtime') run.collect();
}
