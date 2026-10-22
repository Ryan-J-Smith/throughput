import { Disruption, PRICE } from '../model';
import type { Part, RoundMods, ShipContext } from '../model';

// The 4 Market Disruptions (§5); each is active only in its quarter's Boss round.

export class Strike extends Disruption {
  constructor() {
    super({ id: 'strike', name: 'Strike', text: '−1 Build this round (3 instead of 4)' });
  }
  override adjust(mods: RoundMods): void {
    mods.builds -= 1;
  }
}

export class PriceWar extends Disruption {
  constructor() {
    super({ id: 'price-war', name: 'Price War', text: '−$3 final Price (minimum $1)' });
  }
  override onShipAdd(ship: ShipContext): void {
    ship.score.add(PRICE, -3, this.name);
  }
}

export class Recall extends Disruption {
  constructor() {
    super({ id: 'recall', name: 'Recall', text: 'Your most-shipped blueprint this run gets ×0.5' });
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

