import { describe, expect, it } from 'vitest';
import { BOUTIQUE, FACTORY_FLOOR, INFLUENCER, SKETCH, TRUCK, WHOLESALE_CLUB, WORKSHOP } from '../content';
import { scoreLine } from '../rules';
import { boss, card, context, equity, fixture, slot, trends } from './fixtures';

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

describe('scoreLine: seed-03 worked example', () => {
  it('Shift 1 makes $562, matching the table row by row', () => {
    const { line, rndSketch } = workedExample();
    const result = scoreLine(line, context());
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
    const result = scoreLine(line, context());
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
    expect(result.steps[3]?.events.join(' ')).toContain('cap 20→5');
    expect(result.shipSales).toBe(5 * 4);
  });

  it('Robot Arm resolves an Influencer twice (×2.25)', () => {
    const line = [slot(null, card(SKETCH, 'Home')), slot(fixture('robot-arm'), card(INFLUENCER, 'Food'))];
    expect(scoreLine(line, context()).steps[1]?.margin).toBe(4 * 2.25);
  });

  it('Brand Manager needs three same-Category cards in a row', () => {
    const chain = [slot(null, card(SKETCH, 'Home')), slot(null, card(WORKSHOP, 'Home')), slot(fixture('brand-manager'), card(TRUCK, 'Home'))];
    // Margin 2 +2 = 4, +1 handoff = 5, +1 handoff = 6, ×1.5 = 9; 6 Units sold at $9.
    expect(scoreLine(chain, context()).total).toBe(54);
    const broken = [slot(null, card(SKETCH, 'Food')), ...chain.slice(1)];
    expect(scoreLine(broken, context()).steps[2]?.events).not.toContain('Brand Manager Margin ×1.5');
  });

  it('Automation keeps nothing in scoring but Assembly Line doubles Units', () => {
    const line = [slot(null, card(WORKSHOP, 'Home')), slot(fixture('assembly-line'), null), slot(null, card(TRUCK, 'Home'))];
    expect(scoreLine(line, context()).steps[1]?.units).toBe(12);
  });

  it('Flagship multiplies its sale by 1.2 + 0.2 per round owned', () => {
    const line = [slot(null, card(WORKSHOP, 'Home')), slot(fixture('flagship-store', 2), card(TRUCK, 'Food'))];
    expect(scoreLine(line, context()).total).toBe(Math.floor(6 * 2 * 1.6));
  });

  it('Warehouse releases stored Units and stores leftovers up to 40', () => {
    const line = [slot(null, card(FACTORY_FLOOR, 'Home')), slot(fixture('warehouse'), null)];
    const result = scoreLine(line, context({ stored: 30 }));
    expect(result.steps[1]?.units).toBe(44);
    expect(result.storedUnits).toBe(40);
    expect(result.overstockSales).toBe(4);
    expect(result.storedAfter).toBe(40);
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

  it('Emerging grants Equity when it ships, and Equity adds to that Category’s sales', () => {
    expect(scoreLine(line(), context({ trends: trends({ Home: 'emerging' }) })).equityGained).toEqual(['Home']);
    expect(scoreLine(line(), context({ equity: equity({ Home: 2 }) })).total).toBe(6 * 5);
  });

  it('Saturated halves caps unless the Category is Loyal', () => {
    // Margin: 2, Factory Floor -1, handoff +1, Factory Floor -1, handoff +1 = $2; 28 Units.
    const big = () => [slot(null, card(FACTORY_FLOOR, 'Home')), slot(null, card(FACTORY_FLOOR, 'Home')), slot(null, card(TRUCK, 'Home'))];
    expect(scoreLine(big(), context({ trends: trends({ Home: 'saturated' }) })).shipSales).toBe(10 * 2);
    expect(scoreLine(big(), context({ trends: trends({ Home: 'saturated' }), equity: equity({ Home: 3 }) })).shipSales).toBe(20 * 5);
  });
});

describe('scoreLine: bosses', () => {
  it('Supply Shock welds slot 1', () => {
    const line = [slot(fixture('quality-lab'), card(SKETCH, 'Home')), slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home'))];
    const result = scoreLine(line, context({ boss: boss('supply-shock') }));
    expect(result.steps[0]?.label).toBe('(welded)');
    expect(result.total).toBe(6 * 3);
  });

  it('JIT Auditor charges $2 per leftover Unit and closes the Warehouse', () => {
    const line = [slot(null, card(FACTORY_FLOOR, 'Home')), slot(fixture('warehouse'), null)];
    const result = scoreLine(line, context({ boss: boss('jit-auditor'), stored: 10 }));
    expect(result.overstockSales).toBe(-28);
    expect(result.storedAfter).toBe(10);
  });
});
