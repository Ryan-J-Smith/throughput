import { describe, expect, it } from 'vitest';
import { BLUEPRINTS } from '../content';
import { OwnedBlueprint, makePart } from '../model';
import type { BlueprintDef } from '../model';
import { containsRecipe, matchesExactly } from '../rules';
import { clearRound, deckOf, flatTargets, pick, runWith, shipAnything } from './helpers';

const def = (id: string): BlueprintDef => {
  const found = BLUEPRINTS.find((b) => b.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};

describe('recipes', () => {
  const parts = [makePart('chip', 1), makePart('bolt', 2), makePart('bolt', 3)];
  it('Fabricate needs the exact multiset; Ship needs a subset', () => {
    expect(matchesExactly(['bolt', 'chip'], parts.slice(0, 2))).toBe(true);
    expect(matchesExactly(['chip', 'bolt'], parts)).toBe(false);
    expect(containsRecipe(['bolt', 'bolt'], parts)).toBe(true);
    expect(containsRecipe(['chip', 'chip'], parts)).toBe(false);
  });
});

describe('R&D', () => {
  it('Scale adds ½ base Units and Demand, Premium ⅓ base Price, rounding up', () => {
    const fan = new OwnedBlueprint(def('desk-fan'));
    fan.addLevel('scale');
    expect([fan.units, fan.demand, fan.price]).toEqual([15 + 8, 50 + 25, 4]);
    fan.addLevel('premium');
    fan.addLevel('premium');
    expect(fan.price).toBe(4 + 2 + 2);
    expect(fan.rndLevels).toBe(3);
  });

  it('a Sub level adds +3 output grade', () => {
    const run = runWith({ startingDeck: deckOf(['chip', 1], ['bolt', 1], ['shell', 1]) });
    run.blueprint('motor')?.addLevel();
    expect(run.fabricate([pick(run, 'chip'), pick(run, 'bolt')]).output.grade).toBe(2 * 2 + 3);
  });

  it('a Product level needs a choice', () => {
    expect(() => new OwnedBlueprint(def('gizmo')).addLevel()).toThrow(/scale or premium/);
  });
});

describe('Ship scoring', () => {
  const gizmoDeck = deckOf(['shell', 4], ['chip', 4], ['shell', 1], ['chip', 1], ['shell', 2], ['chip', 2], ['paint', 1], ['bolt', 1]);

  it('sells out on a first Ship with Units ≥ Demand, growing Demand permanently', () => {
    const run = runWith({ startingDeck: gizmoDeck, startingFacilities: ['discount-warehouse'] });
    // Gizmo: 8 + 4 + 4 + 8 (warehouse) = 24 Units vs 30 Demand → no sell-out
    expect(run.ship([pick(run, 'shell', 4), pick(run, 'chip', 4)], 'gizmo').growth).toBe(0);
    const big = runWith({ startingDeck: gizmoDeck, startingFacilities: ['discount-warehouse', 'conveyor-belt'] });
    // 8 + 8 + 8 (warehouse) + 6 (conveyor, 2 parts) = 30 ≥ 30
    const result = big.ship([pick(big, 'shell', 4), pick(big, 'chip', 4)], 'gizmo');
    expect(result.quote.sellsOut).toBe(true);
    expect(result.growth).toBe(5);
    expect(big.blueprint('gizmo')?.demand).toBe(35);
    // A repeat Ship this round can't sell out again.
    const again = big.quoteOptions([pick(big, 'shell', 2), pick(big, 'chip', 2)]);
    expect(again[0]?.sellsOut).toBe(false);
    expect(again[0]?.score.get('demand')).toBe(17); // floor(35 / 2)
  });

  it('Viral Marketing grows sell-outs by 15', () => {
    const run = runWith({ startingDeck: gizmoDeck, startingFacilities: ['discount-warehouse', 'conveyor-belt', 'viral-marketing'] });
    expect(run.ship([pick(run, 'shell', 4), pick(run, 'chip', 4)], 'gizmo').growth).toBe(15);
  });

  it('Viral Marketing (tuned): +Units equal to Demand grown and ×(1 + 0.02 per Demand grown)', () => {
    const run = runWith({ startingDeck: gizmoDeck, startingFacilities: ['viral-marketing'] });
    const gizmo = run.blueprint('gizmo') as OwnedBlueprint;
    gizmo.growth = 30;
    const log = run.quoteOptions([pick(run, 'shell', 4), pick(run, 'chip', 4)])[0]?.score.log ?? [];
    const viral = log.filter((c) => c.source === 'Viral Marketing');
    expect(viral.map((c) => [c.stat, c.op, c.amount])).toEqual([
      ['units', 'add', 30],
      ['markup', 'multiply', 1.6],
    ]);
  });

  it('Precision Tooling (tuned): Ships ×(1 + 0.02 per fabricated grade)', () => {
    const run = runWith({
      startingDeck: gizmoDeck,
      startingFacilities: ['precision-tooling'],
      startingBench: () => [makePart('motor', 14, { fabricated: true })],
    });
    const log = run.quoteOptions([pick(run, 'motor', 14), pick(run, 'shell', 4)])[0]?.score.log ?? [];
    const markup = log.find((c) => c.source === 'Precision Tooling');
    expect(markup?.amount).toBeCloseTo(1.28);
  });

  it('Continuous Production stops repeat Ships halving Demand', () => {
    const run = runWith({ startingDeck: gizmoDeck, startingFacilities: ['continuous-production'] });
    run.ship([pick(run, 'shell', 4), pick(run, 'chip', 4)], 'gizmo');
    expect(run.quoteOptions([pick(run, 'shell', 2), pick(run, 'chip', 2)])[0]?.score.get('demand')).toBe(30);
  });

  it('Flagship Store only boosts the first Ship of the round', () => {
    const run = runWith({ startingDeck: gizmoDeck, startingFacilities: ['flagship-store'] });
    const first = run.ship([pick(run, 'shell', 4), pick(run, 'chip', 4)], 'gizmo');
    expect(first.quote.score.get('price')).toBe(2 + 3);
    expect(run.quoteOptions([pick(run, 'shell', 2), pick(run, 'chip', 2)])[0]?.score.get('price')).toBe(2);
  });

  it('Outlet Mall: −$1 Price with a $1 floor, and +1 Build', () => {
    const run = runWith({ startingDeck: gizmoDeck, startingFacilities: ['outlet-mall'] });
    expect(run.buildsLeft).toBe(5);
    expect(run.quoteOptions([pick(run, 'shell', 4), pick(run, 'chip', 4)])[0]?.score.get('price')).toBe(1);
  });

  it('Premium parts add $2 and Paint adds its grade to Price', () => {
    const run = runWith({ startingDeck: () => [makePart('shell', 1, { premium: true }), makePart('chip', 1), makePart('paint', 2)] });
    const [q] = run.quoteOptions([pick(run, 'shell'), pick(run, 'chip'), pick(run, 'paint')]);
    expect(q?.score.values()).toMatchObject({ units: 10, price: 2 + 2 + 2 });
  });

  it('Product Catalog counts distinct Products this round, Patent Office counts R&D levels', () => {
    const run = runWith({
      startingDeck: deckOf(['shell', 1], ['chip', 1], ['shell', 1], ['bolt', 1], ['bolt', 1], ['paint', 1], ['paint', 1], ['paint', 1]),
      startingFacilities: ['product-catalog', 'patent-office'],
    });
    run.blueprint('desk-fan')?.addLevel('premium');
    run.blueprint('motor')?.addLevel();
    const gizmo = run.ship([pick(run, 'shell'), pick(run, 'chip')], 'gizmo');
    expect(gizmo.quote.score.get('markup')).toBeCloseTo(1.25 * 1.2);
    const flatpack = run.quoteOptions([pick(run, 'shell'), pick(run, 'bolt'), run.hand.filter((p) => p.category === 'bolt')[1] ?? pick(run, 'bolt')]);
    expect(flatpack[0]?.score.get('markup')).toBeCloseTo(1.5 * 1.2);
  });

  it('lists every owned Product that fits, with filler counted', () => {
    const run = runWith({ startingDeck: deckOf(['shell', 2], ['chip', 2], ['bolt', 2], ['bolt', 3]) });
    const options = run.quoteOptions([...run.hand]);
    expect(options.map((q) => q.blueprint.id).sort()).toEqual(['flatpack', 'gizmo']);
    expect(options.find((q) => q.blueprint.id === 'gizmo')?.score.get('units')).toBe(8 + 9);
  });
});

describe('Fabricate and the Bench', () => {
  const motorDeck = deckOf(['chip', 1], ['bolt', 1], ['chip', 2], ['bolt', 2], ['chip', 3], ['bolt', 3], ['shell', 1], ['shell', 2]);

  it('a full Bench needs a trash choice', () => {
    const run = runWith({ startingDeck: motorDeck, startingBench: () => [makePart('motor', 5, { fabricated: true }), makePart('motor', 6, { fabricated: true })] });
    const inputs = [pick(run, 'chip', 1), pick(run, 'bolt', 1)];
    expect(run.whyCannotFabricate(inputs)).toMatch(/Bench is full/);
    const trash = run.bench[0];
    const result = run.fabricate(inputs, trash);
    expect(result.trashed).toBe(trash);
    expect(run.bench.map((p) => p.grade)).toEqual([6, 4]);
  });

  it('inputs from the Bench free their slot', () => {
    const run = runWith({ startingDeck: motorDeck, startingBench: () => [makePart('chip', 4), makePart('motor', 6, { fabricated: true })] });
    expect(run.whyCannotFabricate([pick(run, 'chip', 4), pick(run, 'bolt', 1)])).toBeNull();
  });

  it('Stockroom adds a slot; Kitting benches a half-grade copy when there is room', () => {
    const run = runWith({ startingDeck: motorDeck, startingFacilities: ['kitting-station', 'stockroom'] });
    const result = run.fabricate([pick(run, 'chip', 3), pick(run, 'bolt', 3)]);
    expect(result.copiesBenched.map((p) => p.grade)).toEqual([6]);
    expect(run.bench.map((p) => p.grade)).toEqual([12, 6]);
    const second = run.fabricate([pick(run, 'chip', 2), pick(run, 'bolt', 2)]);
    expect(second.copiesLost).toBe(1);
    expect(run.bench.map((p) => p.grade)).toEqual([12, 6, 8]);
  });

  it('Precision Tooling adds +4 grade', () => {
    const run = runWith({ startingDeck: motorDeck, startingFacilities: ['precision-tooling'] });
    expect(run.fabricate([pick(run, 'chip', 1), pick(run, 'bolt', 1)]).output.grade).toBe(8);
  });

  it('rejects non-recipes and Products', () => {
    const run = runWith({ startingDeck: motorDeck });
    expect(run.whyCannotFabricate([pick(run, 'chip', 1), pick(run, 'shell', 1)])).toMatch(/Not exactly an owned Sub recipe/);
    expect(run.whyCannotShip([pick(run, 'chip', 1), pick(run, 'bolt', 1)], 'motor')).toMatch(/is a Sub/);
  });
});

describe('round flow', () => {
  it('draws back to 8 after every Build and Scrap', () => {
    const run = runWith();
    expect(run.hand).toHaveLength(8);
    run.scrap(run.hand.slice(0, 3));
    expect(run.hand).toHaveLength(8);
    expect(run.scrapsLeft).toBe(2);
    shipAnything(run);
    expect(run.hand).toHaveLength(8);
  });

  it('loses when the Builds run out below target', () => {
    const run = runWith({ targets: flatTargets(1_000_000) });
    for (let i = 0; i < 4; i++) shipAnything(run);
    expect(run.phase).toBe('lost');
    expect(run.lastRoundEnd).toMatchObject({ cleared: false });
  });

  it('pays the market reward, unused Builds and interest, then opens the shop', () => {
    const run = runWith({ targets: flatTargets(1), startingCash: 12 });
    clearRound(run);
    expect(run.phase).toBe('shop');
    expect(run.lastRoundEnd?.payout?.lines).toEqual([
      { source: 'Small market cleared', amount: 5 },
      { source: 'Unused Builds ×3', amount: 3 },
      { source: 'Interest', amount: 2 },
    ]);
    expect(run.wallet.cash).toBe(22);
  });

  it('wins after clearing all 12 rounds', () => {
    const run = runWith({ targets: flatTargets(1) });
    for (let round = 0; round < 12; round++) {
      clearRound(run);
      if (round < 11) run.leaveShop();
    }
    expect(run.phase).toBe('won');
    expect(run.round).toMatchObject({ quarter: 4, market: 'boss' });
  });

  it('Bench parts carry over between rounds', () => {
    const motor = makePart('motor', 9, { fabricated: true });
    const shellsAndChips = deckOf(...Array.from({ length: 8 }, (): [string, number] => ['shell', 1]), ...Array.from({ length: 8 }, (): [string, number] => ['chip', 1]));
    const run = runWith({ targets: flatTargets(1), startingDeck: shellsAndChips, startingBench: () => [motor] });
    clearRound(run); // ships a Gizmo, leaving the Motor benched
    run.leaveShop();
    expect(run.bench).toEqual([motor]);
    expect(run.bench[0]).toBe(motor);
  });

  it('is deterministic per seed', () => {
    const hand = (seed: number) => runWith({}, seed).hand.map((p) => `${p.category}${p.grade}`);
    expect(hand(5)).toEqual(hand(5));
    expect(hand(5)).not.toEqual(hand(6));
  });
});

describe('disruptions', () => {
  it('are revealed at the quarter’s first shop and apply only to its Boss round', () => {
    const run = runWith({ targets: flatTargets(1) });
    expect(run.revealedDisruption(1)).toBeNull();
    clearRound(run);
    const disruption = run.revealedDisruption(1);
    expect(disruption).not.toBeNull();
    expect(run.revealedDisruption(2)).toBeNull();
    run.leaveShop();
    expect(run.round.disruption).toBeNull(); // Big round
    clearRound(run);
    run.leaveShop();
    expect(run.round).toMatchObject({ market: 'boss', disruption });
  });

  /** Seeds whose Q1 disruption is the given one. */
  const seedFor = (id: string): number => {
    for (let seed = 1; seed < 200; seed++) if (runWith({}, seed).disruptions[0]?.id === id) return seed;
    throw new Error(id);
  };

  /** Advances to Q1 Boss with tiny targets. */
  const toBoss = (seed: number, overrides = {}) => {
    const run = runWith({ targets: flatTargets(1), ...overrides }, seed);
    clearRound(run);
    run.leaveShop();
    clearRound(run);
    run.leaveShop();
    return run;
  };

  it('Strike: −1 Build in the Boss round', () => {
    expect(toBoss(seedFor('strike')).buildsLeft).toBe(3);
  });

  it('Warehouse Fire empties the Bench at round start', () => {
    const run = toBoss(seedFor('warehouse-fire'), { startingBench: () => [makePart('motor', 9, { fabricated: true })] });
    expect(run.bench).toEqual([]);
  });

  it('Price War: ×0.75 on every Ship (tuned from the doc\'s −$3)', () => {
    const run = toBoss(seedFor('price-war'));
    const options = run.quoteOptions(run.hand.slice(0, 5));
    expect(options.length).toBeGreaterThan(0);
    for (const q of options) expect(q.score.log.some((c) => c.source === 'Price War' && c.amount === 0.75)).toBe(true);
  });

  it('Recall halves the most-shipped blueprint', () => {
    const run = toBoss(seedFor('recall'));
    const most = run.blueprints.reduce((a, b) => (b.shipsThisRun > a.shipsThisRun ? b : a));
    const options = run.quoteOptions(run.hand.slice(0, 5)).filter((q) => q.blueprint === most);
    for (const q of options) expect(q.score.log.some((c) => c.source === 'Recall' && c.amount === 0.5)).toBe(true);
  });
});
