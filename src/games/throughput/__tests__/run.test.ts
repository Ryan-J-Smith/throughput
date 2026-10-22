import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, STARTER_CARDS } from '../content';
import type { ThroughputConfig } from '../content';
import { CATEGORIES, makeUnits } from '../model';
import type { Card, Category, Stage } from '../model';
import { ThroughputRun } from '../rules';
import { easyConfig } from './fixtures';

function handIndex(run: ThroughputRun, stage: Stage): number {
  const i = run.hand.findIndex((c) => c.def.stage === stage);
  if (i < 0) throw new Error(`no ${stage} card in hand`);
  return i;
}

/** Loads one Make into slot 4 and one Ship into slot 5, then runs the Shift. */
function makeAndShip(run: ThroughputRun): void {
  run.load([
    { hand: handIndex(run, 'make'), slot: 3 },
    { hand: handIndex(run, 'ship'), slot: 4 },
  ]);
  run.runShift();
}

/** First seed (from 1) whose first Board boss is `id`. */
function seedWithFirstBoss(id: string, config = easyConfig({ roundsPerYear: 2, targets: [10, 10, 10, 10] })): number {
  for (let seed = 1; seed < 200; seed++) if (new ThroughputRun(seed, config).boardBosses[0]?.id === id) return seed;
  throw new Error(`no seed with ${id} first`);
}

/** First run (by seed) that `setup` can bring to a state where `ready` holds. */
function findRun(config: ThroughputConfig, setup: (run: ThroughputRun) => void, ready: (run: ThroughputRun) => boolean): ThroughputRun {
  for (let seed = 1; seed < 500; seed++) {
    const run = new ThroughputRun(seed, config);
    setup(run);
    if (ready(run)) return run;
  }
  throw new Error('no seed fits');
}

/** Starter deck size, and what is left to draw after the opening hand of 7. */
const DECK = STARTER_CARDS.length * CATEGORIES.length;
const DRAW = DECK - 7;

describe('ThroughputRun: setup', () => {
  it('deals a hand of 7 from the starter deck (4 cards per Category) onto an empty 5-slot Line', () => {
    const run = new ThroughputRun(1);
    expect(run.phase).toBe('shift');
    expect(run.quarter).toEqual({ round: 1, year: 1, quarter: 1, isBoard: false });
    expect(run.target).toBe(DEFAULT_CONFIG.targets[0]);
    expect(run.deck).toHaveLength(16);
    expect(run.hand).toHaveLength(7);
    expect(run.drawPile).toHaveLength(DRAW);
    expect(run.line).toHaveLength(5);
    expect(run.wallet.cash).toBe(4);
    expect(run.retoolsLeft).toBe(2);
    expect(run.boardBosses).toHaveLength(4);
    expect(new Set(run.boardBosses.map((b) => b.id)).size).toBe(4);
  });

  it('is deterministic per seed', () => {
    const a = new ThroughputRun(9);
    const b = new ThroughputRun(9);
    expect(a.hand.map((c) => c.uid)).toEqual(b.hand.map((c) => c.uid));
    expect(a.boardBosses.map((x) => x.id)).toEqual(b.boardBosses.map((x) => x.id));
  });
});

describe('ThroughputRun: a Shift', () => {
  it('Designs stay on the Line; Make and Ship cards are dispatched; the hand refills', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    run.load([
      { hand: handIndex(run, 'design'), slot: 0 },
      { hand: handIndex(run, 'make'), slot: 1 },
    ]);
    run.load([{ hand: handIndex(run, 'ship'), slot: 2 }]);
    run.runShift();
    expect(run.shift).toBe(2);
    expect(run.line.map((s) => s.card?.card.def.stage ?? null)).toEqual(['design', null, null, null, null]);
    expect(run.line[0]?.card?.loadedShift).toBe(1);
    expect(run.hand).toHaveLength(7);
    expect(run.discardPile).toHaveLength(2);
    expect(run.sales).toBeGreaterThan(0);
  });

  it('unload returns a card loaded this Shift; scrap discards a parked one', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    run.load([{ hand: handIndex(run, 'design'), slot: 0 }]);
    expect(run.whyCannotScrap([0])).toMatch(/unload it instead/);
    run.unload([0]);
    expect(run.hand).toHaveLength(7);
    run.load([{ hand: handIndex(run, 'design'), slot: 0 }]);
    run.runShift();
    expect(run.whyCannotUnload([0])).toMatch(/scrap it instead/);
    run.scrap([0]);
    expect(run.line[0]?.card).toBeNull();
  });

  it('hand numbers stay put: loads leave gaps, unload goes back, a Retool and the next Shift fill the gaps', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    const start = [...run.handSlots];
    expect(start).toEqual(run.hand);
    run.load([
      { hand: 1, slot: 0 },
      { hand: 4, slot: 1 },
    ]);
    expect(run.handSlots).toEqual([start[0], null, start[2], start[3], null, start[5], start[6]]);
    expect(run.hand).toEqual([start[0], start[2], start[3], start[5], start[6]]);
    run.unload([1]);
    expect(run.handSlots).toEqual([start[0], null, start[2], start[3], start[4], start[5], start[6]]);
    run.retool([0]);
    const retooled = [...run.handSlots];
    expect(retooled[0]).not.toBe(start[0]);
    expect(retooled.slice(1)).toEqual([null, start[2], start[3], start[4], start[5], start[6]]);
    run.runShift();
    expect(run.handSlots).toHaveLength(7);
    expect(run.handSlots[1]).not.toBeNull();
    expect([run.handSlots[0], ...run.handSlots.slice(2)]).toEqual([retooled[0], ...retooled.slice(2)]);
  });

  it('says which Line cards stay after the run: Designs, and Makes on Automation', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    run.load([
      { hand: handIndex(run, 'design'), slot: 0 },
      { hand: handIndex(run, 'make'), slot: 1 },
    ]);
    expect([0, 1, 2].map((s) => run.staysAfterShift(s))).toEqual([true, false, false]);
  });

  it('Restock: once per round an empty draw pile takes the shuffled discards', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000], retoolsPerRound: 20 }));
    // Each Retool of 3 draws 3; once fewer than 3 are left, the next Retool runs the pile dry.
    const retools = Math.floor(DRAW / 3);
    for (let i = 0; i < retools; i++) run.retool([0, 1, 2]);
    expect([run.drawPile.length, run.discardPile.length, run.restocksLeft]).toEqual([DRAW - 3 * retools, 3 * retools, 1]);
    run.retool([0, 1, 2]);
    expect(run.restocked).toBe(3 * retools + 3);
    expect(run.restocksLeft).toBe(0);
    expect(run.hand).toHaveLength(7);
    expect([run.drawPile.length, run.discardPile.length]).toEqual([DRAW, 0]);
    for (let i = 0; i < 5; i++) run.retool([0, 1, 2]);
    expect(run.drawPile).toHaveLength(0);
    expect(run.hand.length).toBeLessThan(7);
    expect(run.restocked).toBe(3 * retools + 3);
    expect(run.drawPile.length + run.hand.length + run.discardPile.length).toBe(DECK);
  });

  it('the opening hand always holds a Make and a Ship, swapped in from the top of the draw pile', () => {
    const without = easyConfig({ openingHandTypes: [] });
    const has = (run: ThroughputRun, stage: Stage) => run.hand.some((c) => c.def.stage === stage);
    let seed = 1;
    while (has(new ThroughputRun(seed, without), 'ship') && has(new ThroughputRun(seed, without), 'make')) seed++;
    const plain = new ThroughputRun(seed, without);
    const fixed = new ThroughputRun(seed, easyConfig());
    expect(has(fixed, 'make') && has(fixed, 'ship')).toBe(true);
    expect(fixed.hand).toHaveLength(7);
    expect(fixed.drawPile).toHaveLength(DRAW);
    // The two runs deal the same cards (same uids); only the missing types came in from the draw pile.
    const uids = (cards: readonly { uid: number }[]) => cards.map((c) => c.uid);
    const moved = fixed.hand.filter((c) => !uids(plain.hand).includes(c.uid));
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every((c) => uids(plain.drawPile).includes(c.uid) && c.def.stage !== 'design')).toBe(true);
  });

  it('refuses bad loads without changing anything', () => {
    const run = new ThroughputRun(1);
    expect(run.whyCannotLoad([{ hand: 9, slot: 0 }])).toBe('No hand card 10');
    expect(run.whyCannotLoad([{ hand: 0, slot: 5 }])).toMatch(/No slot 6/);
    expect(run.whyCannotLoad([{ hand: 0, slot: 0 }, { hand: 1, slot: 0 }])).toBe('Slot 1 is named twice');
    expect(() => run.load([{ hand: 0, slot: 0 }, { hand: 0, slot: 1 }])).toThrow('Hand card 1 is named twice');
    expect(run.hand).toHaveLength(7);
  });

  it('a Retool discards up to 3 cards and draws as many, twice per round', () => {
    const run = new ThroughputRun(1);
    expect(run.whyCannotRetool([0, 1, 2, 3])).toMatch(/at most 3/);
    run.retool([0, 1, 2]);
    run.retool([0]);
    expect(run.hand).toHaveLength(7);
    expect(run.drawPile).toHaveLength(DRAW - 4);
    expect(run.discardPile).toHaveLength(4);
    expect(run.whyCannotRetool([0])).toBe('No Retools left this round');
  });

  it('missing the target after 4 Shifts loses the run', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    for (let i = 0; i < 4; i++) run.runShift();
    expect(run.phase).toBe('lost');
    expect(run.history).toEqual([{ round: 1, isBoard: false, target: 10_000, sales: 0, won: false, shiftsUsed: 4, shiftTotals: [0, 0, 0, 0], capital: 4 }]);
  });
});

describe('ThroughputRun: payout and shop', () => {
  it('clearing in one Shift pays income, unused Shifts and interest, then opens the shop', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 10 }));
    makeAndShip(run);
    expect(run.phase).toBe('shop');
    expect(run.lastPayout).toEqual([
      { source: 'Q1 cleared', amount: 4 },
      { source: '3 unused Shifts', amount: 6 },
      { source: 'Interest', amount: 2 },
    ]);
    expect(run.wallet.cash).toBe(22);
    expect(run.offers.map((o) => o?.kind)).toEqual(['fixture', 'fixture', 'card', 'card', 'contract']);
    expect(run.line.every((s) => s.card === null)).toBe(true);
  });

  it('pays overkill: +1C per full 25% of the target sold beyond it, up to the cap', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [100, 100, 100], overkill: { step: 0.25, cap: 5 } }));
    expect([100, 124, 125, 150, 199, 225, 1000].map((sales) => run.overkillPayFor(sales))).toEqual([0, 0, 1, 2, 3, 5, 5]);
    const capped = new ThroughputRun(1, easyConfig({ targets: [100, 100, 100], overkill: { step: 0.1, cap: 3 } }));
    expect([109, 110, 130, 500].map((sales) => capped.overkillPayFor(sales))).toEqual([0, 1, 3, 3]);
  });

  it('clearing with overkill adds an Overkill payout line before interest', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [5, 5, 5], startingCapital: 10 }));
    makeAndShip(run);
    expect(run.history[0]?.sales).toBe(12);
    expect(run.lastPayout).toEqual([
      { source: 'Q1 cleared', amount: 4 },
      { source: '3 unused Shifts', amount: 6 },
      { source: 'Overkill (140% over target)', amount: DEFAULT_CONFIG.overkill.cap },
      { source: 'Interest', amount: 2 },
    ]);
  });

  it('buys a Fixture into a chosen slot, a card into the deck, and sells for half', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 100 }));
    makeAndShip(run);
    expect(run.whyCannotBuy(0)).toMatch(/which slot/);
    const fixture = run.buy(0, { slot: 2 });
    expect(run.line[2]?.fixture?.def).toBe(fixture.def);
    // Buying onto an occupied slot sells the Fixture there for half its price as part of the buy.
    const refund = Math.floor(fixture.price / 2);
    expect(run.fixtureRefund(2)).toBe(refund);
    const cash = run.wallet.cash;
    const second = run.buy(1, { slot: 2 });
    expect(run.line[2]?.fixture?.def).toBe(second.def);
    expect(run.wallet.cash).toBe(cash + refund - second.price);
    run.buy(2);
    expect(run.deck).toHaveLength(DECK + 1);
    const before = run.wallet.cash;
    expect(run.sellFixture(2)).toBe(Math.floor(second.price / 2));
    expect(run.wallet.cash).toBe(before + Math.floor(second.price / 2));
    expect(run.whyCannotSellCard(0)).toMatch(/starter card/);
    expect(run.sellCard(DECK)).toBeGreaterThan(0);
    expect(run.deck).toHaveLength(DECK);
  });

  it('counts the refund of a replaced Fixture toward the price', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 100 }));
    makeAndShip(run);
    const first = run.buy(0, { slot: 2 });
    const next = run.offers[1];
    if (next?.kind !== 'fixture') throw new Error('expected a Fixture offer');
    const refund = Math.floor(first.price / 2);
    run.wallet.spend(run.wallet.cash - (next.price - refund));
    expect(run.whyCannotBuy(1, { slot: 3 })).toMatch(/Not enough Capital/);
    expect(run.whyCannotBuy(1, { slot: 2 })).toBeNull();
    run.buy(1, { slot: 2 });
    expect(run.wallet.cash).toBe(0);
  });

  it('in the shop, the Boards ahead start after the round just cleared', () => {
    const run = new ThroughputRun(1, easyConfig({ roundsPerYear: 2, targets: [0, 0, 0, 0] }));
    expect(run.upcomingBoards().map((b) => b.round)).toEqual([2, 4]);
    run.runShift();
    expect(run.upcomingBoards().map((b) => b.round)).toEqual([2, 4]);
    run.continueToNextRound();
    run.runShift();
    expect(run.phase).toBe('shop');
    expect(run.upcomingBoards().map((b) => b.round)).toEqual([4]);
  });

  it('moving a Fixture costs 1C and swaps; rerolls escalate', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 100 }));
    makeAndShip(run);
    run.buy(0, { slot: 0 });
    run.buy(1, { slot: 1 });
    const [a, b] = [run.line[0]?.fixture, run.line[1]?.fixture];
    const cash = run.wallet.cash;
    run.moveFixture(0, 1);
    expect([run.line[0]?.fixture, run.line[1]?.fixture]).toEqual([b, a]);
    expect(run.wallet.cash).toBe(cash - 1);
    expect(run.rerollCost).toBe(2);
    run.reroll();
    expect(run.rerollCost).toBe(3);
    expect(run.wallet.cash).toBe(cash - 3);
  });

  it('contracts upgrade or remove deck cards and expand the Line', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 1000 }));
    makeAndShip(run);
    const rerollFor = (effect: string) => {
      for (let i = 0; i < 50 && run.offers[4]?.kind !== 'contract'; i++) run.reroll();
      for (let i = 0; i < 50; i++) {
        const offer = run.offers[4];
        if (offer?.kind === 'contract' && offer.def.effect === effect) return;
        run.reroll();
      }
      throw new Error(`no ${effect} offer`);
    };
    rerollFor('tooling');
    run.buy(4, { deckCard: 0 });
    expect(run.deck[0]?.upgrades).toBe(1);
    rerollFor('downsize');
    run.buy(4, { deckCard: 0 });
    expect(run.deck).toHaveLength(DECK - 1);
    rerollFor('expand');
    run.buy(4);
    expect(run.line).toHaveLength(6);
  });

  it('Tooling Upgrade refuses Trucks and Wholesale Clubs, which have no cap to raise', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 1000 }));
    makeAndShip(run);
    for (let i = 0; i < 200 && !(run.offers[4]?.kind === 'contract' && run.offers[4].def.effect === 'tooling'); i++) run.reroll();
    const truck = run.deck.findIndex((c) => c.def.id === 'truck');
    expect(run.whyCannotBuy(4, { deckCard: truck })).toMatch(/Truck-. has no cap to raise \(it sells up to Demand\)/);
  });

  it('continue starts the next round with a fresh deck and the market moved on', () => {
    const run = new ThroughputRun(1, easyConfig());
    makeAndShip(run);
    run.continueToNextRound();
    expect(run.round).toBe(2);
    expect(run.trendsNow).toEqual(run.trends[1]);
    expect(run.hand).toHaveLength(7);
    expect(run.drawPile).toHaveLength(DRAW);
  });

  it('clearing the last round wins', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10] }));
    makeAndShip(run);
    expect(run.phase).toBe('won');
  });
});

describe('ThroughputRun: bosses', () => {
  const config = easyConfig({ roundsPerYear: 2, targets: [10, 10, 10, 10], startingCapital: 100 });

  it('Line Shift leaves Shift 1 on your layout, moves Fixtures right from Shift 2, and restores the layout after the round', () => {
    const run = new ThroughputRun(seedWithFirstBoss('line-shift'), { ...config, targets: [10, 10_000, 10, 10] });
    makeAndShip(run);
    const fixture = run.buy(0, { slot: 0 });
    run.continueToNextRound();
    expect(run.boss?.id).toBe('line-shift');
    const owned = run.line[0]?.fixture;
    expect(owned?.def).toBe(fixture.def);
    expect(run.fixtureMoves).toEqual([]);
    run.runShift();
    expect(run.line[1]?.fixture).toBe(owned);
    expect(run.fixtureMoves).toEqual([{ fixture: owned, from: 0, to: 1 }]);
    run.runShift();
    expect(run.fixtureMoves).toEqual([{ fixture: owned, from: 1, to: 2 }]);
    for (let i = 0; i < 2; i++) run.runShift();
    expect(run.phase).toBe('lost');
    expect(run.line[0]?.fixture?.def).toBe(fixture.def);
  });

  it('in a Line Shift round parked cards can be unloaded back to hand; in other rounds only scrapped', () => {
    const designFirst = (r: ThroughputRun) => {
      makeAndShip(r);
      r.continueToNextRound();
    };
    const run = findRun({ ...config, targets: [10, 10_000, 10, 10] }, designFirst, (r) => r.boss?.id === 'line-shift' && r.hand.some((c) => c.def.stage === 'design'));
    const design = run.hand[handIndex(run, 'design')];
    run.load([{ hand: handIndex(run, 'design'), slot: 0 }]);
    run.runShift();
    expect(run.whyCannotUnload([0])).toBeNull();
    run.unload([0]);
    expect(run.hand).toContain(design);
    expect(run.line[0]?.card).toBeNull();

    const plain = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    plain.load([{ hand: handIndex(plain, 'design'), slot: 0 }]);
    plain.runShift();
    expect(plain.whyCannotUnload([0])).toMatch(/scrap it instead/);
  });

  it('Turnover dispatches Designs', () => {
    const run = findRun(
      { ...config, targets: [10, 10_000, 10, 10] },
      (r) => {
        makeAndShip(r);
        r.continueToNextRound();
      },
      (r) => r.boss?.id === 'turnover' && r.hand.some((c) => c.def.stage === 'design'),
    );
    run.load([{ hand: handIndex(run, 'design'), slot: 0 }]);
    expect(run.staysAfterShift(0)).toBe(false);
    run.runShift();
    expect(run.line[0]?.card).toBeNull();
  });

  it('Supply Shock refuses loads into slot 1', () => {
    const run = new ThroughputRun(seedWithFirstBoss('supply-shock'), config);
    makeAndShip(run);
    run.continueToNextRound();
    expect(run.whyCannotLoad([{ hand: 0, slot: 0 }])).toBe('Slot 1 is welded shut');
  });

  it('the Warehouse stocks its Make\'s Units through the Year and sells the stock in the Board Review', () => {
    const config = easyConfig({ startingCapital: 5000, targets: [10, 10, 10] });
    let seed = 1;
    while (new ThroughputRun(seed, config).boardBosses[0]?.id === 'jit-auditor') seed++;
    const run = new ThroughputRun(seed, config);
    makeAndShip(run);
    for (let i = 0; i < 300 && run.line[0]?.fixture == null; i++) {
      const offer = run.offers.findIndex((o) => o?.kind === 'fixture' && o.def.id === 'warehouse');
      if (offer >= 0) run.buy(offer, { slot: 0 });
      else run.reroll();
    }
    expect(run.line[0]?.fixture?.def.id).toBe('warehouse');
    run.continueToNextRound();
    run.load([{ hand: handIndex(run, 'make'), slot: 0 }]);
    const units = makeUnits(run.line[0]?.card?.card as Card);
    run.load([{ hand: handIndex(run, 'ship'), slot: 4 }]);
    run.runShift();
    expect(run.phase).toBe('shop');
    expect(run.stored).toBe(units);
    expect(run.storageNotice).toBe(`Warehouse: ${units} Units in stock for the next Board Review`);
    run.continueToNextRound();
    expect(run.quarter.isBoard).toBe(true);
    // An empty Line: the Batch reaches the Warehouse at the base Margin, and the stock sells at ×2.
    const result = run.runShift();
    expect(result.total).toBe(units * DEFAULT_CONFIG.baseMargin * 2);
    expect(run.stored).toBe(0);
  });
});

describe('ThroughputRun: Demand and R&D Grants', () => {
  const tight = (start: number) => easyConfig({ targets: [10_000, 10_000, 10_000], demand: { start, sellOutGrowth: 10, sellOutRate: 0, emergingGrowth: 0, saturatedMul: 0.5 } });

  it('each Category starts with the configured Demand, halved in its Saturated round', () => {
    const run = findRun(easyConfig(), () => {}, (r) => Object.values(r.trendsNow).includes('saturated'));
    for (const c of CATEGORIES) {
      expect(run.demand[c]).toBe(DEFAULT_CONFIG.demand.start);
      expect(run.demandLeft[c]).toBe(run.trendsNow[c] === 'saturated' ? DEFAULT_CONFIG.demand.start / 2 : DEFAULT_CONFIG.demand.start);
    }
  });

  it('sales use up Demand for the round; a sell-out grows it for good from the next round', () => {
    const run = findRun(tight(3), () => {}, (r) => r.hand.some((c) => c.def.stage === 'ship' && r.trendsNow[c.category] === 'neutral'));
    const truck = run.hand.findIndex((c) => c.def.stage === 'ship' && run.trendsNow[c.category] === 'neutral');
    const category = run.hand[truck]?.category as Category;
    run.load([
      { hand: handIndex(run, 'make'), slot: 3 },
      { hand: truck, slot: 4 },
    ]);
    const result = run.runShift();
    expect(result.demandSold[category]).toBe(3);
    expect(result.soldOut).toContain(category);
    expect(run.demandLeft[category]).toBe(0);
    expect(run.demand[category]).toBe(13);
  });

  it('an R&D Grant needs a Category and an option; Scale adds Demand, Premium a level', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 1000 }));
    makeAndShip(run);
    const rerollForGrant = () => {
      for (let i = 0; i < 200 && !(run.offers[4]?.kind === 'contract' && run.offers[4].def.effect === 'grant'); i++) run.reroll();
    };
    rerollForGrant();
    expect(run.whyCannotBuy(4)).toMatch(/Say which Category and scale or premium/);
    const food = run.demand.Food;
    run.buy(4, { category: 'Food', option: 'scale' });
    expect(run.grants.Food).toEqual({ scale: 1, premium: 0 });
    expect(run.demand.Food).toBe(food + DEFAULT_CONFIG.grant.scaleDemand);
    rerollForGrant();
    run.buy(4, { category: 'Home', option: 'premium' });
    expect(run.grants.Home).toEqual({ scale: 0, premium: 1 });
    expect(run.shiftContext().grants.Home).toEqual({ scale: 0, premium: 1 });
  });
});
