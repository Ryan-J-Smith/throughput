import { Facility, PAINT, PRICE, UNITS, DEMAND } from '../model';
import type { FabContext, RoundMods, ShipContext } from '../model';

// The 14 facilities from the design doc (§3). Each hook is a line or two.

export class FlagshipStore extends Facility {
  readonly rarity = 'common';
  readonly cost = 4;
  constructor() {
    super({ id: 'flagship-store', name: 'Flagship Store', text: '+$3 Price on the first Ship each round' });
  }
  override onShipAdd(ship: ShipContext): void {
    if (ship.isFirstShip) ship.score.add(PRICE, 3, this.name);
  }
}

export class DiscountWarehouse extends Facility {
  readonly rarity = 'common';
  readonly cost = 4;
  constructor() {
    super({ id: 'discount-warehouse', name: 'Discount Warehouse', text: '+8 Units on every Ship' });
  }
  override onShipAdd(ship: ShipContext): void {
    ship.score.add(UNITS, 8, this.name);
  }
}

export class PaintShop extends Facility {
  readonly rarity = 'common';
  readonly cost = 5;
  constructor() {
    super({ id: 'paint-shop', name: 'Paint Shop', text: '+$1 Price per Paint in the Ship' });
  }
  override onShipAdd(ship: ShipContext): void {
    const paints = ship.parts.filter((p) => p.category === PAINT).length;
    if (paints > 0) ship.score.add(PRICE, paints, this.name);
  }
}

export class Stockroom extends Facility {
  readonly rarity = 'common';
  readonly cost = 4;
  constructor() {
    super({ id: 'stockroom', name: 'Stockroom', text: '+1 Bench slot' });
  }
  override adjust(mods: RoundMods): void {
    mods.benchSlots += 1;
  }
}

export class OutletMall extends Facility {
  readonly rarity = 'common';
  readonly cost = 5;
  constructor() {
    super({ id: 'outlet-mall', name: 'Outlet Mall', text: '+1 Build per round; −$1 Price on every Ship (minimum $1)' });
  }
  override adjust(mods: RoundMods): void {
    mods.builds += 1;
  }
  override onShipAdd(ship: ShipContext): void {
    ship.score.add(PRICE, -1, this.name);
  }
}

export class PrecisionTooling extends Facility {
  readonly rarity = 'common';
  readonly cost = 6;
  constructor() {
    super({ id: 'precision-tooling', name: 'Precision Tooling', text: 'Fabricated parts get +4 grade; Ships ×(1 + 0.02 per fabricated grade)' });
  }
  override onFabricate(fab: FabContext): void {
    fab.bonus += 4;
  }
  // Tuned (DESIGN_NOTES "Tuning", levers 3 and 2b): the Assembly Chain's multiplicative path; was Uncommon.
  override shipMultiplier(ship: ShipContext): number {
    return 1 + 0.02 * ship.parts.reduce((sum, p) => sum + (p.fabricated ? p.grade : 0), 0);
  }
}

export class KittingStation extends Facility {
  readonly rarity = 'uncommon';
  readonly cost = 7;
  constructor() {
    super({ id: 'kitting-station', name: 'Kitting Station', text: 'Fabricate also benches a second copy at half grade' });
  }
  override onFabricate(fab: FabContext): void {
    fab.copies += 1;
  }
}

export class LeanLine extends Facility {
  readonly rarity = 'uncommon';
  readonly cost = 6;
  constructor() {
    super({ id: 'lean-line', name: 'Lean Line', text: '×(1 + 0.25 per part below 5 in the Ship)' });
  }
  override shipMultiplier(ship: ShipContext): number {
    return 1 + 0.25 * Math.max(0, 5 - ship.parts.length);
  }
}

export class ConveyorBelt extends Facility {
  readonly rarity = 'uncommon';
  readonly cost = 6;
  constructor() {
    super({ id: 'conveyor-belt', name: 'Conveyor Belt', text: '+3 Units per part in the Ship' });
  }
  override onShipAdd(ship: ShipContext): void {
    ship.score.add(UNITS, 3 * ship.parts.length, this.name);
  }
}

export class MarketResearch extends Facility {
  readonly rarity = 'uncommon';
  readonly cost = 6;
  constructor() {
    super({ id: 'market-research', name: 'Market Research', text: '+15 Demand on all Products' });
  }
  override onShipAdd(ship: ShipContext): void {
    ship.score.add(DEMAND, 15, this.name);
  }
}

export class ViralMarketing extends Facility {
  readonly rarity = 'common';
  readonly cost = 6;
  constructor() {
    super({
      id: 'viral-marketing',
      name: 'Viral Marketing',
      text: 'Sell-out growth is +15 instead of +5; Ships get +Units equal to Demand grown and ×(1 + 0.02 per Demand grown)',
    });
  }
  override adjust(mods: RoundMods): void {
    mods.sellOutGrowth = Math.max(mods.sellOutGrowth, 15);
  }
  // Tuned (DESIGN_NOTES "Tuning", levers 3 and 2b): the Market Maker's multiplicative path; was Uncommon.
  // Units keep pace with grown Demand so sell-outs keep compounding.
  override onShipAdd(ship: ShipContext): void {
    if (ship.blueprint.growth > 0) ship.score.add(UNITS, ship.blueprint.growth, this.name);
  }
  override shipMultiplier(ship: ShipContext): number {
    return 1 + 0.02 * ship.blueprint.growth;
  }
}

export class ProductCatalog extends Facility {
  readonly rarity = 'uncommon';
  readonly cost = 7;
  constructor() {
    super({
      id: 'product-catalog',
      name: 'Product Catalog',
      text: '×(1 + 0.25 × distinct Products shipped this round, including this one)',
    });
  }
  override shipMultiplier(ship: ShipContext): number {
    return 1 + 0.25 * ship.distinctShipped;
  }
}

export class ContinuousProduction extends Facility {
  readonly rarity = 'rare';
  readonly cost = 8;
  constructor() {
    super({ id: 'continuous-production', name: 'Continuous Production', text: "Repeat Ships don't halve Demand" });
  }
  override adjust(mods: RoundMods): void {
    mods.demandHalves = false;
  }
}

export class PatentOffice extends Facility {
  readonly rarity = 'rare';
  readonly cost = 8;
  constructor() {
    super({ id: 'patent-office', name: 'Patent Office', text: '×(1 + 0.1 × R&D levels owned)' });
  }
  override shipMultiplier(ship: ShipContext): number {
    return 1 + 0.1 * ship.rndLevelsOwned;
  }
}

/** One instance of each facility. Facilities hold no per-run state, so instances are shared. */
export const FACILITIES: readonly Facility[] = [
  new FlagshipStore(),
  new DiscountWarehouse(),
  new PaintShop(),
  new Stockroom(),
  new OutletMall(),
  new PrecisionTooling(),
  new KittingStation(),
  new LeanLine(),
  new ConveyorBelt(),
  new MarketResearch(),
  new ViralMarketing(),
  new ProductCatalog(),
  new ContinuousProduction(),
  new PatentOffice(),
];
