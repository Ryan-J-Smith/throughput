import { FixtureEffect } from '../model';
import type { Batch, Card, Fixture, FixtureDef, SlotContext } from '../model';

class QualityLab extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card?.def.stage === 'design') batch.addMargin(4, 'Quality Lab');
  }
}

class OvertimeCrew extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card?.def.stage === 'make') batch.addUnits(8, 'Overtime Crew');
  }
}

class Showroom extends FixtureEffect {
  override onSlot(batch: Batch, here: SlotContext): void {
    if (here.card?.def.stage === 'ship') batch.addMargin(3, 'Showroom');
  }
}

class RndLab extends FixtureEffect {
  override afterResolve(card: Card, batch: Batch): void {
    if (card.def.stage === 'design') batch.grow(card, 'R&D Lab');
  }
}

class Automation extends FixtureEffect {
  override keepsOnLine(card: Card): boolean {
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

class Warehouse extends FixtureEffect {
  override onSlot(batch: Batch): void {
    if (!batch.warehouseOpen) {
      batch.note('Warehouse closed');
      return;
    }
    if (batch.stored > 0) batch.addUnits(batch.stored, 'Warehouse releases');
    batch.stored = 0;
    batch.storing = true;
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
}

/** ×1.2, +0.2 per round cleared since the Flagship was bought. */
export function flagshipMultiplier(roundsOwned: number): number {
  return Math.round((1.2 + 0.2 * roundsOwned) * 100) / 100;
}

export const FIXTURES: readonly FixtureDef[] = [
  { id: 'quality-lab', name: 'Quality Lab', kind: 'mod', rarity: 'common', price: 4, text: 'A Design here gets +$4.', effect: new QualityLab() },
  { id: 'overtime-crew', name: 'Overtime Crew', kind: 'mod', rarity: 'common', price: 4, text: 'A Make card here gets +8 Units.', effect: new OvertimeCrew() },
  { id: 'showroom', name: 'Showroom', kind: 'mod', rarity: 'common', price: 4, text: 'A Ship card here gets +$3 Margin before selling.', effect: new Showroom() },
  {
    id: 'rnd-lab',
    name: 'R&D Lab',
    kind: 'mod',
    rarity: 'uncommon',
    price: 6,
    text: 'Each time a Design here resolves, it gains +$1 for the rest of the run.',
    effect: new RndLab(),
  },
  { id: 'automation', name: 'Automation', kind: 'mod', rarity: 'uncommon', price: 6, text: 'A Make card here is not dispatched.', effect: new Automation() },
  {
    id: 'brand-manager',
    name: 'Brand Manager',
    kind: 'mod',
    rarity: 'uncommon',
    price: 6,
    text: 'If this slot and the 2 before it hold same-Category cards: Margin ×1.5.',
    effect: new BrandManager(),
  },
  {
    id: 'price-gun',
    name: 'Price Gun',
    kind: 'station',
    rarity: 'uncommon',
    price: 6,
    text: 'Station. Margin ×2. Every later Ship card has half capacity.',
    effect: new PriceGun(),
  },
  { id: 'assembly-line', name: 'Assembly Line', kind: 'station', rarity: 'uncommon', price: 6, text: 'Station. Units ×2.', effect: new AssemblyLine() },
  {
    id: 'warehouse',
    name: 'Warehouse',
    kind: 'station',
    rarity: 'uncommon',
    price: 5,
    text: 'Station. Adds stored Units to the Batch; leftover Units are stored (max 40) instead of cleared. Each shop visit: pay 1C per 10 stored or lose them.',
    effect: new Warehouse(),
  },
  { id: 'robot-arm', name: 'Robot Arm', kind: 'mod', rarity: 'rare', price: 8, text: 'The card here resolves twice.', effect: new RobotArm() },
  {
    id: 'flagship-store',
    name: 'Flagship Store',
    kind: 'mod',
    rarity: 'rare',
    price: 8,
    text: 'A Ship card here sells at Margin ×1.2, +0.2 per round cleared since you bought it.',
    effect: new FlagshipStore(),
  },
];

export function fixtureById(id: string): FixtureDef {
  const def = FIXTURES.find((f) => f.id === id);
  if (def === undefined) throw new Error(`unknown fixture "${id}"`);
  return def;
}
