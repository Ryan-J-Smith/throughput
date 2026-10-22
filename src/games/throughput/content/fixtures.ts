import { FixtureEffect, formatAmount, makeUnits, shipCap } from '../model';
import type { Batch, Card, Fixture, FixtureDef, SlotContext } from '../model';

class QualityLab extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card?.def.stage === 'design') batch.addMargin(4, 'Quality Lab');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'design';
  }
}

class OvertimeCrew extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card?.def.stage === 'make') batch.addUnits(8, 'Overtime Crew');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'make';
  }
}

class Showroom extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card?.def.stage === 'ship') batch.addMargin(3, 'Showroom');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'ship';
  }
}

class RndLab extends FixtureEffect {
  override afterResolve(card: Card, batch: Batch): void {
    if (card.def.stage === 'design') batch.grow(card, 'R&D Lab');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'design';
  }
}

/** Units a Make on Automation gains for good each time it resolves. */
export const AUTOMATION_GROWTH = 3;

class Automation extends FixtureEffect {
  override keepsOnLine(card: Card): boolean {
    return card.def.stage === 'make';
  }

  override afterResolve(card: Card, batch: Batch): void {
    if (card.def.stage === 'make') batch.grow(card, 'Automation', AUTOMATION_GROWTH);
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'make';
  }
}

class BrandManager extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    const [one, two] = here.previous;
    const category = here.card?.category;
    if (category !== undefined && one?.category === category && two?.category === category) {
      batch.mulMargin(1.5, 'Brand Manager');
    }
  }
}

class PriceGun extends FixtureEffect {
  override onSlot(batch: Batch): void {
    batch.mulMargin(2, 'Price Gun');
    batch.mulCaps(0.5, 'Price Gun');
  }
}

class AssemblyLine extends FixtureEffect {
  override onSlot(batch: Batch): void {
    batch.mulUnits(2, 'Assembly Line');
  }
}

/** Margin multiplier on an Express Lane sale in a round's first Shift. */
export const EXPRESS_LANE_MUL = 3;

/** The Warehouse's Board Review sale: stock × the Batch's Margin here × this. */
export const WAREHOUSE_BOARD_MUL = 2;

/**
 * Stockpiles all Year (a Make card here also copies its Units into stock) and sells the stock,
 * ignoring Demand, at the Batch's Margin ×2 here in a Board Review.
 */
class Warehouse extends FixtureEffect {
  override onSlot(batch: Batch): void {
    if (!batch.warehouseOpen) {
      batch.note('Warehouse closed');
      return;
    }
    if (batch.boardReview && batch.stored > 0) {
      const price = Math.max(0, batch.margin) * WAREHOUSE_BOARD_MUL;
      const revenue = Math.floor(batch.stored * price);
      batch.sales += revenue;
      batch.note(`Warehouse sells ${batch.stored} stored × $${formatAmount(price)} = $${revenue}`);
      batch.stored = 0;
    }
  }

  override afterResolve(card: Card, batch: Batch): void {
    if (card.def.stage !== 'make' || !batch.warehouseOpen) return;
    const units = makeUnits(card);
    batch.stored += units;
    batch.stocked += units;
    batch.note(`Warehouse stocks a copy: +${units} Units`);
  }
}

class RobotArm extends FixtureEffect {
  override resolveCount(): number {
    return 2;
  }
}

class FlagshipStore extends FixtureEffect {
  override saleMultiplier(card: Card, fixture: Fixture): number {
    return card.def.stage === 'ship' ? flagshipMultiplier(fixture.roundsOwned) : 1;
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'ship';
  }
}

class DesignStudio extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card?.def.stage === 'design') batch.addMargin(here.previous[0]?.def.stage === 'design' ? 4 : 2, 'Design Studio');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'design';
  }
}

class PackagingLine extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card?.def.stage === 'ship') batch.addUnits(6, 'Packaging Line');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'ship';
  }
}

/** Make cards in the 2 slots before this one. */
function makesBefore(here: SlotContext): number {
  return here.previous.filter((card) => card?.def.stage === 'make').length;
}

class ConveyorBelt extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    const makes = makesBefore(here);
    if (here.card?.def.stage === 'make' && makes > 0) batch.addUnits(4 * makes, 'Conveyor Belt');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'make';
  }
}

class SignatureLine extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card !== null && here.previous[0]?.category === here.card.category) batch.addMargin(2, 'Signature Line');
  }
}

class CrossDock extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    const makes = makesBefore(here);
    if (here.card?.def.stage === 'ship' && makes > 0) batch.addMargin(2 * makes, 'Cross-Dock');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'ship';
  }
}

class LogisticsHub extends FixtureEffect {
  override onSlot(batch: Batch): void {
    const add = Math.floor(batch.units / 10);
    if (add > 0) batch.addMargin(add, 'Logistics Hub');
  }
}

class LuxuryCounter extends FixtureEffect {
  override saleMultiplier(card: Card): number {
    return this.appliesTo(card) ? 2 : 1;
  }

  override appliesTo(card: Card): boolean {
    const cap = shipCap(card);
    return card.def.stage === 'ship' && typeof cap === 'number' && cap <= 8;
  }
}

class ExpressLane extends FixtureEffect {
  override saleMultiplier(card: Card, _fixture: Fixture, batch?: Batch): number {
    return card.def.stage === 'ship' && batch?.shift === 1 ? EXPRESS_LANE_MUL : 1;
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'ship';
  }
}

class LeanCell extends FixtureEffect {
  override onSlot(batch: Batch): void {
    if (batch.units <= 15) batch.mulMargin(1.5, 'Lean Cell');
  }
}

class Megafactory extends FixtureEffect {
  override onSlot(batch: Batch): void {
    batch.mulUnits(3, 'Megafactory');
    batch.addMargin(-1, 'Megafactory');
  }
}

class PatentOffice extends FixtureEffect {
  override afterResolve(card: Card, batch: Batch): void {
    if (card.def.stage === 'design' && card.growth > 0) batch.mulMargin(1 + 0.1 * card.growth, 'Patent Office');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'design';
  }
}

class Superstore extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card?.def.stage === 'ship' && batch.units > 0) batch.mulMargin(1 + batch.units / 50, 'Superstore');
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'ship';
  }
}

class RoboticsCell extends FixtureEffect {
  override resolveCount(card: Card): number {
    return card.def.stage === 'make' ? 3 : 1;
  }

  override appliesTo(card: Card): boolean {
    return card.def.stage === 'make';
  }
}

/** ×1.2, +0.15 per round cleared since the Flagship was bought. */
export function flagshipMultiplier(roundsOwned: number): number {
  return Math.round((1.2 + 0.15 * roundsOwned) * 100) / 100;
}

export const FIXTURES: readonly FixtureDef[] = [
  { id: 'quality-lab', name: 'Quality Lab', kind: 'mod', rarity: 'common', price: 4, text: 'A Design here gets +$4.', short: '+$4 to a Design', effect: new QualityLab() },
  { id: 'overtime-crew', name: 'Overtime Crew', kind: 'mod', rarity: 'common', price: 4, text: 'A Make card here gets +8 Units.', short: 'Make +8 Units', effect: new OvertimeCrew() },
  {
    id: 'design-studio',
    name: 'Design Studio',
    kind: 'mod',
    rarity: 'common',
    price: 4,
    text: 'A Design here gets +$2, or +$4 if the slot before holds a Design.',
    short: 'Design +$2 (+$4 stacked)',
    effect: new DesignStudio(),
  },
  { id: 'packaging-line', name: 'Packaging Line', kind: 'mod', rarity: 'common', price: 3, text: 'A Ship card here gets +6 Units before it sells.', short: 'Ship +6 Units', effect: new PackagingLine() },
  {
    id: 'conveyor-belt',
    name: 'Conveyor Belt',
    kind: 'mod',
    rarity: 'common',
    price: 3,
    text: 'A Make card here gets +4 Units for each Make card in the 2 slots before it.',
    short: '+4 Units/Make before',
    effect: new ConveyorBelt(),
  },
  {
    id: 'signature-line',
    name: 'Signature Line',
    kind: 'mod',
    rarity: 'common',
    price: 3,
    text: 'A card here gets +$2 Margin if the card just before shares its Category.',
    short: '+$2 after same Category',
    effect: new SignatureLine(),
  },
  {
    id: 'cross-dock',
    name: 'Cross-Dock',
    kind: 'mod',
    rarity: 'common',
    price: 3,
    text: 'A Ship card here gets +$2 Margin for each Make card in the 2 slots before it.',
    short: '+$2 per Make before',
    effect: new CrossDock(),
  },
  { id: 'showroom', name: 'Showroom', kind: 'mod', rarity: 'common', price: 4, text: 'With a Ship card here: +$3 Margin before it sells (carries on to later slots).', short: 'Ship +$3, carries on', effect: new Showroom() },
  {
    id: 'rnd-lab',
    name: 'R&D Lab',
    kind: 'mod',
    rarity: 'uncommon',
    price: 6,
    text: 'Each time a Design here resolves, it gains +$1 for the rest of the run.',
    short: 'Design grows +$1',
    effect: new RndLab(),
  },
  { id: 'automation', name: 'Automation', kind: 'mod', rarity: 'uncommon', price: 5, text: 'A Make card here stays on the Line and gains +3 Units for good each Shift.', short: 'Make stays, grows +3', effect: new Automation() },
  {
    id: 'brand-manager',
    name: 'Brand Manager',
    kind: 'mod',
    rarity: 'uncommon',
    price: 6,
    text: 'If this slot and the 2 before it hold same-Category cards: Margin ×1.5.',
    short: '3 same Category: ×1.5',
    effect: new BrandManager(),
  },
  {
    id: 'price-gun',
    name: 'Price Gun',
    kind: 'station',
    rarity: 'uncommon',
    price: 6,
    text: 'Station. Margin ×2. Every later Ship card has half capacity.',
    short: '×2, later Ships halved',
    effect: new PriceGun(),
  },
  { id: 'assembly-line', name: 'Assembly Line', kind: 'station', rarity: 'uncommon', price: 5, text: 'Station. Units ×2.', short: 'Units ×2', effect: new AssemblyLine() },
  {
    id: 'warehouse',
    name: 'Warehouse',
    kind: 'mod',
    rarity: 'uncommon',
    price: 5,
    text: 'A Make card here also copies its Units into stock. Board Reviews: the stock sells here at Margin ×2.',
    short: 'Stock sells at Boards',
    effect: new Warehouse(),
  },
  {
    id: 'logistics-hub',
    name: 'Logistics Hub',
    kind: 'mod',
    rarity: 'common',
    price: 4,
    text: '+$1 Margin for every 10 Units in the Batch here.',
    short: '+$1 per 10 Units',
    effect: new LogisticsHub(),
  },
  {
    id: 'luxury-counter',
    name: 'Luxury Counter',
    kind: 'mod',
    rarity: 'uncommon',
    price: 6,
    text: 'A Ship card here with a cap of 8 or less sells at Margin ×2.',
    short: 'Ship cap ≤8: ×2',
    effect: new LuxuryCounter(),
  },
  { id: 'express-lane', name: 'Express Lane', kind: 'mod', rarity: 'uncommon', price: 6, text: 'A Ship card here sells at Margin ×3 in the first Shift of each round.', short: 'Ship ×3, Shift 1', effect: new ExpressLane() },
  {
    id: 'lean-cell',
    name: 'Lean Cell',
    kind: 'station',
    rarity: 'uncommon',
    price: 4,
    text: 'Station. If the Batch has 15 or fewer Units here: Margin ×1.5.',
    short: '≤15 Units: ×1.5',
    effect: new LeanCell(),
  },
  { id: 'megafactory', name: 'Megafactory', kind: 'station', rarity: 'uncommon', price: 5, text: 'Station. Units ×3, -$1 Margin.', short: 'Units ×3, -$1', effect: new Megafactory() },
  { id: 'robot-arm', name: 'Robot Arm', kind: 'mod', rarity: 'rare', price: 8, text: 'The card here resolves twice.', short: 'Card resolves twice', effect: new RobotArm() },
  {
    id: 'flagship-store',
    name: 'Flagship Store',
    kind: 'mod',
    rarity: 'rare',
    price: 8,
    text: 'A Ship card here sells at Margin ×1.2, +0.15 per round cleared since you bought it.',
    short: 'Ship ×1.2, +0.15/round',
    effect: new FlagshipStore(),
  },
  {
    id: 'patent-office',
    name: 'Patent Office',
    kind: 'mod',
    rarity: 'rare',
    price: 7,
    text: 'A Design here also multiplies Margin by 1 + 0.1 per +$1 of R&D growth it has.',
    short: 'Design ×(1 + growth/10)',
    effect: new PatentOffice(),
  },
  {
    id: 'superstore',
    name: 'Superstore',
    kind: 'mod',
    rarity: 'uncommon',
    price: 6,
    text: 'With a Ship card here: Margin ×(1 + Units in the Batch ÷ 50) before it sells.',
    short: 'Ship ×(1 + Units/50)',
    effect: new Superstore(),
  },
  { id: 'robotics-cell', name: 'Robotics Cell', kind: 'mod', rarity: 'rare', price: 7, text: 'A Make card here resolves three times.', short: 'Make resolves 3×', effect: new RoboticsCell() },
];

export function fixtureById(id: string): FixtureDef {
  const def = FIXTURES.find((f) => f.id === id);
  if (def === undefined) throw new Error(`unknown fixture "${id}"`);
  return def;
}
