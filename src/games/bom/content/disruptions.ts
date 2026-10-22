import { Disruption } from '../model';
import type { Part, RoundMods, ShipContext } from '../model';

// The 4 Market Disruptions (§5); each is active only in its quarter's Boss round.

export class Strike extends Disruption {
  constructor() {
    super({ id: 'strike', name: 'Strike', text: '−1 Build in the Boss round' });
  }
  override adjust(mods: RoundMods): void {
    mods.builds -= 1;
  }
}

// Tuned (DESIGN_NOTES "Tuning", lever 1): the doc's flat −$3 Price gutted cheap Products. ×0.75 Price
// is applied as Markup, which is the same under Units × Price × Markup.
export class PriceWar extends Disruption {
  constructor() {
    super({ id: 'price-war', name: 'Price War', text: '×0.75 Price on every Ship' });
  }
  override shipMultiplier(_ship: ShipContext): number {
    return 0.75;
  }
}

export class Recall extends Disruption {
  constructor() {
    super({ id: 'recall', name: 'Recall', text: 'Your most-shipped Product this run (ties: all of them) gets ×0.5' });
  }
  override shipMultiplier(ship: ShipContext): number {
    return ship.mostShipped.has(ship.blueprint.id) ? 0.5 : 1;
  }
}

export class WarehouseFire extends Disruption {
  constructor() {
    super({ id: 'warehouse-fire', name: 'Warehouse Fire', text: 'The Bench is emptied at round start' });
  }
  override onRoundStart(bench: Part[]): void {
    bench.length = 0;
  }
}

export const DISRUPTIONS: readonly Disruption[] = [new Strike(), new PriceWar(), new Recall(), new WarehouseFire()];

