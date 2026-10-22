import { describe, expect, it } from 'vitest';
import type { ThroughputConfig } from '../content';
import type { Stage } from '../model';
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

describe('ThroughputRun: setup', () => {
  it('deals a hand of 7 from a 20-card starter deck onto an empty 5-slot Line', () => {
    const run = new ThroughputRun(1);
    expect(run.phase).toBe('shift');
    expect(run.quarter).toEqual({ round: 1, year: 1, quarter: 1, isBoard: false });
    expect(run.target).toBe(150);
    expect(run.deck).toHaveLength(20);
    expect(run.hand).toHaveLength(7);
    expect(run.drawPile).toHaveLength(13);
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
    expect(run.drawPile).toHaveLength(9);
    expect(run.discardPile).toHaveLength(4);
    expect(run.whyCannotRetool([0])).toBe('No Retools left this round');
  });

  it('missing the target after 4 Shifts loses the run', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    for (let i = 0; i < 4; i++) run.runShift();
    expect(run.phase).toBe('lost');
    expect(run.history).toEqual([{ round: 1, isBoard: false, target: 10_000, sales: 0, won: false, shiftsUsed: 4, capital: 4 }]);
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

  it('buys a Fixture into a chosen slot, a card into the deck, and sells for half', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 100 }));
    makeAndShip(run);
    expect(run.whyCannotBuy(0)).toMatch(/which slot/);
    const fixture = run.buy(0, { slot: 2 });
    expect(run.line[2]?.fixture?.def).toBe(fixture.def);
    expect(run.whyCannotBuy(1, { slot: 2 })).toMatch(/already has/);
    run.buy(2);
    expect(run.deck).toHaveLength(21);
    const before = run.wallet.cash;
    expect(run.sellFixture(2)).toBe(Math.floor(fixture.price / 2));
    expect(run.wallet.cash).toBe(before + Math.floor(fixture.price / 2));
    expect(run.whyCannotSellCard(0)).toMatch(/starter card/);
    expect(run.sellCard(20)).toBeGreaterThan(0);
    expect(run.deck).toHaveLength(20);
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
    expect(run.deck).toHaveLength(19);
    rerollFor('expand');
    run.buy(4);
    expect(run.line).toHaveLength(6);
  });

  it('continue starts the next round with a fresh deck and the market moved on', () => {
    const run = new ThroughputRun(1, easyConfig());
    makeAndShip(run);
    run.continueToNextRound();
    expect(run.round).toBe(2);
    expect(run.trendsNow).toEqual(run.trends[1]);
    expect(run.hand).toHaveLength(7);
    expect(run.drawPile).toHaveLength(13);
  });

  it('clearing the last round wins', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10] }));
    makeAndShip(run);
    expect(run.phase).toBe('won');
  });
});

describe('ThroughputRun: bosses', () => {
  const config = easyConfig({ roundsPerYear: 2, targets: [10, 10, 10, 10], startingCapital: 100 });

  it('Line Shift moves Fixtures right each Shift and restores the layout after the round', () => {
    const run = new ThroughputRun(seedWithFirstBoss('line-shift'), { ...config, targets: [10, 10_000, 10, 10] });
    makeAndShip(run);
    const fixture = run.buy(0, { slot: 0 });
    run.continueToNextRound();
    expect(run.boss?.id).toBe('line-shift');
    expect(run.line[1]?.fixture?.def).toBe(fixture.def);
    run.runShift();
    expect(run.line[2]?.fixture?.def).toBe(fixture.def);
    for (let i = 0; i < 3; i++) run.runShift();
    expect(run.phase).toBe('lost');
    expect(run.line[0]?.fixture?.def).toBe(fixture.def);
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
    run.runShift();
    expect(run.line[0]?.card).toBeNull();
  });

  it('Supply Shock refuses loads into slot 1', () => {
    const run = new ThroughputRun(seedWithFirstBoss('supply-shock'), config);
    makeAndShip(run);
    run.continueToNextRound();
    expect(run.whyCannotLoad([{ hand: 0, slot: 0 }])).toBe('Slot 1 is welded shut');
  });

  it('the Warehouse stores leftovers and charges 1C per 10 on entering the shop', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 100, targets: [10, 10, 10] }));
    makeAndShip(run);
    for (let i = 0; i < 50 && run.line[2]?.fixture == null; i++) {
      const offer = run.offers.findIndex((o) => o?.kind === 'fixture' && o.def.id === 'warehouse');
      if (offer >= 0) run.buy(offer, { slot: 2 });
      else run.reroll();
    }
    expect(run.line[2]?.fixture?.def.id).toBe('warehouse');
    run.continueToNextRound();
    run.load([{ hand: handIndex(run, 'make'), slot: 0 }]);
    run.runShift();
    const stored = run.stored;
    expect(stored).toBeGreaterThan(0);
    const cash = run.wallet.cash;
    // Make and Ship ahead of the Warehouse, which then puts the released Units back in storage.
    run.load([{ hand: handIndex(run, 'make'), slot: 0 }]);
    run.load([{ hand: handIndex(run, 'ship'), slot: 1 }]);
    run.runShift();
    expect(run.phase).toBe('shop');
    expect(run.stored).toBe(stored);
    const fee = Math.ceil(run.stored / 10);
    expect(run.storageNotice).toBe(`Paid ${fee}C storage for ${run.stored} stored Units`);
    expect(run.wallet.cash).toBe(cash + (run.lastPayout ?? []).reduce((sum, l) => sum + l.amount, 0) - fee);
  });
});
