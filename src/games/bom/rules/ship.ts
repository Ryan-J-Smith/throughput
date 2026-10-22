import { ScoreContext } from '../../../engine/scoring';
import { BomFormula, DEMAND, MARKUP, PAINT, PREMIUM_PRICE, PRICE, UNITS, partLabel } from '../model';
import type { BomRule, OwnedBlueprint, Part, RoundMods, ShipContext } from '../model';

export type ShipInput = {
  readonly blueprint: OwnedBlueprint;
  readonly parts: readonly Part[];
  /** Active rules: owned facilities plus the disruption on its Boss round. */
  readonly rules: readonly BomRule[];
  readonly mods: RoundMods;
  readonly isFirstShip: boolean;
  /** Distinct Products shipped this round before this Ship. */
  readonly shippedThisRound: ReadonlySet<string>;
  readonly rndLevelsOwned: number;
  readonly mostShipped: ReadonlySet<string>;
};

export type ShipQuote = {
  readonly blueprint: OwnedBlueprint;
  readonly parts: readonly Part[];
  /** Every step of the calculation, for the receipt. */
  readonly score: ScoreContext;
  readonly revenue: number;
  /** First Ship of this Product this round with Units ≥ Demand. */
  readonly sellsOut: boolean;
};

const formula = new BomFormula();

/**
 * Scores a Ship without changing anything (used for both previews and real Ships):
 * base (with Demand halving) → parts → additive rules → price floor → multipliers.
 */
export function quoteShip(input: ShipInput): ShipQuote {
  const { blueprint, parts, rules, mods } = input;
  const score = new ScoreContext(formula);
  const name = blueprint.def.name;
  const prior = blueprint.shipsThisRound;

  score.set(UNITS, blueprint.units, name);
  score.set(PRICE, blueprint.price, name);
  score.set(DEMAND, blueprint.demand, name);
  if (mods.demandHalves && prior > 0) {
    score.set(DEMAND, Math.floor(blueprint.demand / 2 ** prior), `Demand halved ×${prior} (repeat Ship)`);
  }

  for (const part of parts) {
    score.add(part.category === PAINT ? PRICE : UNITS, part.grade, partLabel(part));
    if (part.premium) score.add(PRICE, PREMIUM_PRICE, `${partLabel(part)} tag`);
  }

  const shipped = new Set(input.shippedThisRound).add(blueprint.id);
  const context: ShipContext = {
    blueprint,
    parts,
    score,
    isFirstShip: input.isFirstShip,
    priorShipsOfThis: prior,
    distinctShipped: shipped.size,
    rndLevelsOwned: input.rndLevelsOwned,
    mostShipped: input.mostShipped,
  };
  for (const rule of rules) rule.onShipAdd(context);
  if (score.get(PRICE) < 1) score.set(PRICE, 1, 'minimum $1');
  for (const rule of rules) {
    const factor = rule.shipMultiplier(context);
    if (factor !== 1) score.multiply(MARKUP, factor, rule.name);
  }

  return {
    blueprint,
    parts,
    score,
    revenue: score.total(),
    sellsOut: prior === 0 && score.get(UNITS) >= score.get(DEMAND),
  };
}
