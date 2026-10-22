import { describe, expect, it } from 'vitest';
import { BOUTIQUE, DEFAULT_CONFIG, FACTORY_FLOOR, INFLUENCER, REBRAND, SKETCH, TRUCK, WHOLESALE_CLUB, WORKSHOP } from '../content';
import type { Card } from '../model';
import { scoreLine } from '../rules';
import type { LineSlot } from '../rules';
import { boss, card, context, demandLeft, fixture, grants, slot, trends } from './fixtures';

/** seed-03 §2 worked example: six slots, the R&D Sketch already at +$5. */
function workedExample(make = card(WORKSHOP, 'Home')) {
  const rndSketch = card(SKETCH, 'Gadgets', { growth: 3 });
  const line = [
    slot(fixture('rnd-lab'), rndSketch),
    slot(fixture('quality-lab'), card(SKETCH, 'Gadgets')),
    slot(fixture('price-gun'), null),
    slot(fixture('overtime-crew'), make),
    slot(null, card(BOUTIQUE, 'Home')),
    slot(fixture('showroom'), card(TRUCK, 'Home')),
  ];
  return { line, rndSketch };
}

// seed-03 predates Demand: Home Demand 24 leaves the Truck behind the Gun its old reach of 10 after
// the Boutique's 4 (half of the 20 left).
const workedDemand = () => context({ demandLeft: demandLeft({ Home: 24 }) });

describe('scoreLine: seed-03 worked example', () => {
  it('Shift 1 makes $562, matching the table row by row', () => {
    const { line, rndSketch } = workedExample();
    const result = scoreLine(line, workedDemand());
    expect(result.steps.map((s) => [s.units, s.margin, s.sales])).toEqual([
      [0, 7, 0],
      [0, 14, 0],
      [0, 28, 0],
      [14, 28, 0],
      [10, 29, 232],
      [0, 33, 562],
    ]);
    expect(result.total).toBe(562);
    expect(result.leftover).toBe(0);
    expect(result.grown).toEqual([rndSketch]);
  });

  it('a Factory Floor instead of the Workshop overproduces behind the Gun: $552', () => {
    const { line } = workedExample(card(FACTORY_FLOOR, 'Home'));
    const result = scoreLine(line, workedDemand());
    expect(result.shipSales).toBe(544);
    expect(result.overstockSales).toBe(8);
    expect(result.total).toBe(552);
  });

  it('Shift 2 with the Designs still parked: two cards make $334', () => {
    const line = [
      slot(fixture('rnd-lab'), card(SKETCH, 'Gadgets', { growth: 4 })),
      slot(fixture('quality-lab'), card(SKETCH, 'Gadgets')),
      slot(fixture('price-gun'), null),
      slot(fixture('overtime-crew'), card(WORKSHOP, 'Apparel')),
      slot(null, null),
      slot(fixture('showroom'), card(TRUCK, 'Apparel')),
    ];
    const result = scoreLine(line, context());
    expect(result.shipSales).toBe(330);
    expect(result.overstockSales).toBe(4);
    expect(result.total).toBe(334);
  });

  it('starter baseline D D M M S with one handoff makes $7 × 12 = $84', () => {
    const line = [
      slot(null, card(SKETCH, 'Apparel')),
      slot(null, card(SKETCH, 'Gadgets')),
      slot(null, card(WORKSHOP, 'Gadgets')),
      slot(null, card(WORKSHOP, 'Home')),
      slot(null, card(TRUCK, 'Food')),
    ];
    expect(scoreLine(line, context()).total).toBe(84);
  });
});

describe('scoreLine: cards and fixtures', () => {
  it('Wholesale Club sells everything at half Margin, ignoring cap cuts', () => {
    const line = [slot(fixture('price-gun'), null), slot(null, card(FACTORY_FLOOR, 'Food')), slot(null, card(WHOLESALE_CLUB, 'Food'))];
    // Margin 2 ×2 = 4, Factory Floor -1 = 3, handoff +1 = 4; 14 Units at $2.
    expect(scoreLine(line, context()).total).toBe(28);
  });

  it('two Guns quarter Truck capacity', () => {
    const line = [
      slot(null, card(FACTORY_FLOOR, 'Food')),
      slot(fixture('price-gun'), null),
      slot(fixture('price-gun'), null),
      slot(null, card(TRUCK, 'Food')),
    ];
    const result = scoreLine(line, context());
    expect(result.steps[3]?.events.join(' ')).toContain('cap ×0.25 of Demand');
    expect(result.shipSales).toBe(5 * 4);
  });

  it('Robot Arm resolves an Influencer twice (×2.25)', () => {
    const line = [slot(null, card(SKETCH, 'Home')), slot(fixture('robot-arm'), card(INFLUENCER, 'Food'))];
    expect(scoreLine(line, context()).steps[1]?.margin).toBe(4 * 2.25);
  });

  it('a repeat Rebrand in one Shift gives its smaller × and names itself in the trace', () => {
    // Robot Arm resolves one Rebrand twice: -$2 ×2, then -$2 ×1.5 as the "2nd Rebrand".
    const armed = scoreLine([slot(null, card(SKETCH, 'Home')), slot(fixture('robot-arm'), card(REBRAND, 'Food'))], context()).steps[1];
    expect(armed?.margin).toBe(((4 - 2) * 2 - 2) * 1.5);
    expect(armed?.events).toEqual(['Design -$2', 'Design Margin ×2', 'Design -$2', '2nd Rebrand Margin ×1.5']);
    // Three copies: the 3rd is counted on.
    const three = scoreLine([slot(null, card(REBRAND, 'Home')), slot(null, card(REBRAND, 'Food')), slot(null, card(REBRAND, 'Gadgets'))], context());
    expect(three.steps[2]?.events).toContain('3rd Rebrand Margin ×1.5');
  });

  it('Brand Manager needs three same-Category cards in a row', () => {
    const chain = [slot(null, card(SKETCH, 'Home')), slot(null, card(WORKSHOP, 'Home')), slot(fixture('brand-manager'), card(TRUCK, 'Home'))];
    // Margin 2 +2 = 4, +1 handoff = 5, +1 handoff = 6, ×1.5 = 9; 6 Units sold at $9.
    expect(scoreLine(chain, context()).total).toBe(54);
    const broken = [slot(null, card(SKETCH, 'Food')), ...chain.slice(1)];
    expect(scoreLine(broken, context()).steps[2]?.events).not.toContain('Brand Manager Margin ×1.5');
  });

  it('Automation grows its Make +3 Units for good; Assembly Line doubles Units', () => {
    const automated = card(WORKSHOP, 'Home');
    const result = scoreLine([slot(fixture('automation'), automated)], context());
    expect(result.grown).toEqual([automated, automated, automated]);
    expect(result.steps[0]?.units).toBe(6);
    expect(scoreLine([slot(fixture('automation'), card(WORKSHOP, 'Home', { growth: 9 }))], context()).steps[0]?.units).toBe(15);
    const line = [slot(null, card(WORKSHOP, 'Home')), slot(fixture('assembly-line'), null), slot(null, card(TRUCK, 'Home'))];
    expect(scoreLine(line, context()).steps[1]?.units).toBe(12);
  });

  it('Flagship multiplies its sale by 1.2 + 0.15 per round owned', () => {
    const line = [slot(null, card(WORKSHOP, 'Home')), slot(fixture('flagship-store', 2), card(TRUCK, 'Food'))];
    expect(scoreLine(line, context()).total).toBe(Math.floor(6 * 2 * 1.5));
  });

  it('tags a Fixture idle where it does nothing for the card on it', () => {
    const line = [slot(fixture('quality-lab'), card(SKETCH, 'Home')), slot(fixture('overtime-crew'), card(WORKSHOP, 'Home')), slot(fixture('quality-lab'), card(TRUCK, 'Home'))];
    const steps = scoreLine(line, context()).steps;
    expect(steps.map((s) => s.label)).toEqual(['[Quality Lab] Sketch-H', '[Overtime Crew] Workshop-H', '[Quality Lab: idle] Truck-H']);
    expect(steps.map((s) => [s.fixture?.name, s.card, s.idle, s.welded])).toEqual([
      ['Quality Lab', 'Sketch-H', false, false],
      ['Overtime Crew', 'Workshop-H', false, false],
      ['Quality Lab', 'Truck-H', true, false],
    ]);
  });

  it('Warehouse copies its Make\'s Units into stock, keeping them in the Batch too', () => {
    const line = [slot(fixture('warehouse'), card(FACTORY_FLOOR, 'Home')), slot(null, card(TRUCK, 'Home'))];
    const result = scoreLine(line, context({ stored: 30 }));
    expect(result.steps[0]?.units).toBe(14);
    expect(result.stockedUnits).toBe(14);
    expect(result.storedAfter).toBe(44);
    // Margin $2 - $1 + Handoff $1: the Truck still sells all 14.
    expect(result.shipSales).toBe(14 * 2);
  });

  it('Warehouse sells its stock at the Batch\'s Margin ×2 in a Board Review', () => {
    // Margin $2 + Sketch $2 + Handoff $1 = $5 when the Batch reaches the Warehouse.
    const line = [slot(null, card(SKETCH, 'Home')), slot(fixture('warehouse'), card(WORKSHOP, 'Home'))];
    const result = scoreLine(line, context({ stored: 30, boss: boss('turnover') }));
    expect(result.steps[1]?.events).toContain('Warehouse sells 30 stored × $10 = $300');
    expect(result.storedAfter).toBe(6);
    expect(scoreLine(line, context({ stored: 30 })).storedAfter).toBe(36);
    // It sells even with no card in its slot: Margin $2 + Sketch $2 (no Handoff into an empty slot).
    const empty = scoreLine([line[0] as LineSlot, slot(fixture('warehouse'), null)], context({ stored: 30, boss: boss('turnover') }));
    expect(empty.steps[1]?.events).toContain('Warehouse sells 30 stored × $8 = $240');
    expect(empty.storedAfter).toBe(0);
  });
});

describe('scoreLine: trends', () => {
  const line = () => [slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home'))];

  it('Hot sells at ×2 while buzz pips remain', () => {
    expect(scoreLine(line(), context({ trends: trends({ Home: 'hot' }) })).total).toBe(6 * 3 * 2);
    const noPips = scoreLine(line(), context({ trends: trends({ Home: 'hot' }), hotPipsLeft: 0 }));
    expect(noPips.total).toBe(18);
    expect(noPips.hotPipUsed).toBe(false);
  });

  it('Emerging sales grow that Category’s Demand', () => {
    const result = scoreLine(line(), context({ trends: trends({ Home: 'emerging' }) }));
    expect(result.emergingSold).toEqual(['Home']);
    expect(result.demandGrowth).toEqual({ Home: DEFAULT_CONFIG.demand.emergingGrowth });
  });
});

describe('scoreLine: Demand', () => {
  const line = () => [slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home'))];
  // Margin: 2, Factory Floor -1, handoff +1, Factory Floor -1, handoff +1 = $2; 28 Units.
  const big = (...ships: Card[]) => [slot(null, card(FACTORY_FLOOR, 'Home')), slot(null, card(FACTORY_FLOOR, 'Home')), ...ships.map((c) => slot(null, c))];

  it('a Truck sells up to its Category’s Demand left, shared with later Ships of that Category', () => {
    const result = scoreLine(big(card(TRUCK, 'Home'), card(TRUCK, 'Gadgets'), card(TRUCK, 'Home')), context({ demandLeft: demandLeft({ Home: 15 }) }));
    expect(result.steps.slice(2).map((s) => s.units)).toEqual([13, 0, 0]);
    expect(result.demandSold).toEqual({ Home: 15, Gadgets: 13 });
    expect(result.steps[2]?.events.at(-1)).toMatch(/Ship sells 15 × \$2 = \$30 \(Home Demand 15→0 sold out\)/);
  });

  it('selling the last of a Category’s Demand grows it for good', () => {
    const result = scoreLine(big(card(TRUCK, 'Home')), context());
    expect(result.soldOut).toEqual(['Home']);
    expect(result.demandGrowth).toEqual({ Home: DEFAULT_CONFIG.demand.sellOutGrowth });
    expect(scoreLine(line(), context()).soldOut).toEqual([]);
  });

  it('a Category with no Demand left sells nothing and does not sell out again', () => {
    const result = scoreLine(big(card(TRUCK, 'Home')), context({ demandLeft: demandLeft({ Home: 0 }) }));
    expect(result.shipSales).toBe(0);
    expect(result.soldOut).toEqual([]);
  });

  it('Boutique sells up to 8 and its Demand left; Wholesale Club ignores Demand', () => {
    expect(scoreLine(big(card(BOUTIQUE, 'Home')), context({ demandLeft: demandLeft({ Home: 5 }) })).demandSold).toEqual({ Home: 5 });
    const wholesale = scoreLine(big(card(WHOLESALE_CLUB, 'Home')), context({ demandLeft: demandLeft({ Home: 0 }) }));
    expect(wholesale.shipSales).toBe(28 * 1);
    expect(wholesale.demandSold).toEqual({});
  });

  it('Price Gun halves what a Truck may take of Demand', () => {
    const result = scoreLine([slot(fixture('price-gun'), null), ...big(card(TRUCK, 'Home'))], context());
    expect(result.demandSold).toEqual({ Home: 10 });
  });
});

describe('scoreLine: R&D Grants', () => {
  const line = () => [slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home'))];
  it('Scale adds Units at each of the Category’s Ships; Premium raises its price', () => {
    const scaled = scoreLine(line(), context({ grants: grants({ Home: { scale: 2 } }) }));
    expect(scaled.steps[1]?.events).toContain(`Scale +${2 * DEFAULT_CONFIG.grant.scaleUnits} Units`);
    expect(scaled.total).toBe((6 + 2 * DEFAULT_CONFIG.grant.scaleUnits) * 3);
    expect(scoreLine(line(), context({ grants: grants({ Home: { premium: 2 } }) })).total).toBe(Math.floor(6 * 3 * (1 + 2 * DEFAULT_CONFIG.grant.premiumStep)));
    expect(scoreLine(line(), context({ grants: grants({ Gadgets: { scale: 1, premium: 1 } }) })).total).toBe(6 * 3);
  });
});

describe('scoreLine: bosses', () => {
  it('Supply Shock welds slot 1', () => {
    const line = [slot(fixture('quality-lab'), card(SKETCH, 'Home')), slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home'))];
    const result = scoreLine(line, context({ boss: boss('supply-shock') }));
    expect(result.steps[0]).toMatchObject({ label: '(welded)', welded: true, fixture: null, card: null, idle: false });
    expect(result.total).toBe(6 * 3);
  });

  it('JIT Auditor charges $2 per leftover Unit and closes the Warehouse', () => {
    const line = [slot(fixture('warehouse'), card(FACTORY_FLOOR, 'Home'))];
    const result = scoreLine(line, context({ boss: boss('jit-auditor'), stored: 10 }));
    expect(result.overstockSales).toBe(-28);
    expect(result.stockedUnits).toBe(0);
    expect(result.storedAfter).toBe(10);
  });
});
