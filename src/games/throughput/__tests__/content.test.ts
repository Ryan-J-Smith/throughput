import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  CONTRACTS,
  CONTRACT_MANUFACTURER,
  DEFAULT_CONFIG,
  FIXTURES,
  INFLUENCER,
  POP_UP_SHOP,
  SHOP_CARDS,
  SKETCH,
  TRUCK,
  WORKSHOP,
} from '../content';
import { ThroughputRun, scoreLine } from '../rules';
import { boss, card, context, easyConfig, fixture, slot } from './fixtures';

// Content wave 1 (completion plan): 12 shop cards, 24 Fixtures, 8 Contracts, 8 Board bosses.

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe('content catalogue', () => {
  it('has the wave-1 counts, unique ids, and modifier text of at most 20 words', () => {
    expect(SHOP_CARDS).toHaveLength(12);
    expect(FIXTURES).toHaveLength(24);
    expect(CONTRACTS).toHaveLength(8);
    expect(BOSSES).toHaveLength(8);
    for (const list of [SHOP_CARDS, FIXTURES, CONTRACTS, BOSSES] as const) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
    for (const item of [...SHOP_CARDS, ...FIXTURES, ...CONTRACTS]) expect(words(item.text), item.id).toBeLessThanOrEqual(20);
  });

  it('gives every Fixture a plate gist of 2 to 4 words', () => {
    for (const def of FIXTURES) expect(words(def.short ?? ''), def.id).toBeGreaterThanOrEqual(2);
    for (const def of FIXTURES) expect(words(def.short ?? ''), def.id).toBeLessThanOrEqual(4);
  });
});

describe('wave-1 Fixtures', () => {
  const make = () => card(WORKSHOP, 'Home');
  const ship = () => card(TRUCK, 'Home');

  it('Design Studio: +$2 on a Design, +$4 after another Design', () => {
    const alone = scoreLine([slot(fixture('design-studio'), card(SKETCH, 'Home')), slot(null, make()), slot(null, ship())], context());
    expect(alone.steps[0]?.margin).toBe(2 + 2 + 2);
    const after = scoreLine([slot(null, card(SKETCH, 'Food')), slot(fixture('design-studio'), card(SKETCH, 'Home'))], context());
    expect(after.steps[1]?.margin).toBe(2 + 2 + 4 + 2);
  });

  it('Packaging Line adds 6 Units before a Ship sells; Cross-Dock adds $2 per Make in the 2 slots before', () => {
    expect(scoreLine([slot(fixture('packaging-line'), ship())], context()).demandSold).toEqual({ Home: 6 });
    const dock = scoreLine([slot(null, card(WORKSHOP, 'Food')), slot(null, card(WORKSHOP, 'Apparel')), slot(fixture('cross-dock'), card(TRUCK, 'Home'))], context());
    expect(dock.steps[2]?.events).toContain('Cross-Dock +$4');
  });

  it('Conveyor Belt adds 4 Units per Make in the 2 slots before; Robotics Cell resolves a Make three times', () => {
    const belt = scoreLine([slot(null, card(WORKSHOP, 'Food')), slot(null, card(WORKSHOP, 'Apparel')), slot(fixture('conveyor-belt'), make())], context());
    expect(belt.steps[2]?.units).toBe(6 + 6 + 8 + 6);
    expect(scoreLine([slot(fixture('robotics-cell'), make())], context()).steps[0]?.units).toBe(18);
  });

  it('Signature Line adds $2 when the card before shares its Category', () => {
    const line = [slot(null, card(WORKSHOP, 'Home')), slot(fixture('signature-line'), ship())];
    expect(scoreLine(line, context()).steps[1]?.events).toContain('Signature Line +$2');
  });

  it('Logistics Hub adds $1 per 10 Units; Megafactory triples Units for -$1; Superstore multiplies by 1 + Units/50', () => {
    const big = [slot(null, card(CONTRACT_MANUFACTURER, 'Food')), slot(fixture('megafactory'), null)];
    const mega = scoreLine(big, context());
    expect(mega.steps[1]?.units).toBe(60);
    expect(mega.steps[1]?.margin).toBe(2 - 1 - 1);
    const hub = scoreLine([slot(null, card(CONTRACT_MANUFACTURER, 'Food')), slot(fixture('logistics-hub'), null)], context());
    expect(hub.steps[1]?.margin).toBe(2 - 1 + 2);
    const store = scoreLine([slot(null, card(CONTRACT_MANUFACTURER, 'Food')), slot(fixture('superstore'), card(TRUCK, 'Food'))], context());
    expect(store.steps[1]?.events).toContain('Superstore Margin ×1.4');
  });

  it('Luxury Counter doubles small-cap Ships only; Lean Cell is ×1.5 at 15 Units or fewer', () => {
    const popUp = scoreLine([slot(null, make()), slot(fixture('luxury-counter'), card(POP_UP_SHOP, 'Food'))], context());
    expect(popUp.total).toBe(5 * 2 * 3 * 2 + 1);
    const truck = scoreLine([slot(null, make()), slot(fixture('luxury-counter'), card(TRUCK, 'Food'))], context());
    expect(truck.total).toBe(6 * 2);
    expect(scoreLine([slot(null, make()), slot(fixture('lean-cell'), null)], context()).steps[1]?.margin).toBe(3);
    expect(scoreLine([slot(null, card(CONTRACT_MANUFACTURER, 'Food')), slot(fixture('lean-cell'), null)], context()).steps[1]?.margin).toBe(1);
  });

  it('Patent Office multiplies by 1 + 0.1 per R&D growth on its Design; Express Lane is ×3 in Shift 1 only', () => {
    const grown = scoreLine([slot(fixture('patent-office'), card(SKETCH, 'Home', { growth: 5 }))], context());
    expect(grown.steps[0]?.margin).toBe((2 + 7) * 1.5);
    const express = [slot(null, make()), slot(fixture('express-lane'), card(TRUCK, 'Food'))];
    expect(scoreLine(express, context()).total).toBe(6 * 2 * 3);
    expect(scoreLine(express, context({ shift: 2 })).total).toBe(6 * 2);
  });
});

describe('wave-1 Board bosses', () => {
  it('Bottleneck welds slot 3; Ethics Review drops Design ×s but keeps +$', () => {
    expect(boss('bottleneck').isWelded(2)).toBe(true);
    const line = [slot(null, card(INFLUENCER, 'Home', { upgrades: 1 })), slot(null, make2()), slot(null, card(TRUCK, 'Food'))];
    expect(scoreLine(line, context({ boss: boss('ethics-review') })).steps[0]?.margin).toBe(3);
    expect(scoreLine(line, context()).steps[0]?.margin).toBe(4.5);
  });

  it('Recession halves Demand in its round; Short Week has 3 Shifts', () => {
    const config = easyConfig({ roundsPerYear: 1, targets: [10_000, 10_000] });
    const find = (id: string) => {
      for (let seed = 1; seed < 400; seed++) if (new ThroughputRun(seed, config).boardBosses[0]?.id === id) return new ThroughputRun(seed, config);
      throw new Error(`no ${id}`);
    };
    const recession = find('recession');
    for (const c of Object.keys(recession.demand) as (keyof typeof recession.demand)[]) {
      expect(recession.demandLeft[c]).toBe(Math.floor(recession.demand[c] * (recession.trendsNow[c] === 'saturated' ? 0.5 : 1) * 0.5));
    }
    const short = find('short-week');
    expect(short.shiftsThisRound).toBe(3);
    for (let i = 0; i < 3; i++) short.runShift();
    expect(short.phase).toBe('lost');
  });
});

describe('wave-1 Contracts', () => {
  /** A run in its first shop with the Contract `effect` on offer. */
  function shopWith(effect: string): ThroughputRun {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 5000, targets: [0, 0, 0] }));
    run.runShift();
    for (let i = 0; i < 300 && !(run.offers[4]?.kind === 'contract' && run.offers[4].def.effect === effect); i++) run.reroll();
    return run;
  }

  it('Clone copies a deck card with its upgrades and growth', () => {
    const run = shopWith('clone');
    const source = run.deck[0];
    if (source === undefined) throw new Error('empty deck');
    source.upgrades = 2;
    source.growth = 3;
    run.buy(4, { deckCard: 0 });
    expect(run.deck.at(-1)).toMatchObject({ def: source.def, category: source.category, upgrades: 2, growth: 3, paid: 0 });
    expect(run.deck.at(-1)?.uid).not.toBe(source.uid);
  });

  it('a Clone of a bought card resells at half that card\'s price, like the card itself', () => {
    const run = shopWith('clone');
    const offer = run.offers.findIndex((o) => o?.kind === 'card');
    expect(offer).toBeGreaterThanOrEqual(0);
    run.buy(offer);
    const bought = run.deck.at(-1);
    if (bought === undefined) throw new Error('no card bought');
    run.buy(4, { deckCard: run.deck.length - 1 });
    const clone = run.deck.length - 1;
    expect(run.deck[clone]?.paid).toBe(bought.def.price);
    expect(run.whyCannotSellCard(clone)).toBeNull();
    expect(run.sellCard(clone)).toBe(Math.floor(bought.def.price * run.config.sellRate));
  });

  it('Ad Campaign, Training Program and Treasury Bond add a pip, a Retool and 1C a round for good', () => {
    const run = shopWith('campaign');
    run.buy(4);
    expect(run.perks).toEqual({ hotPips: 1, retools: 0, coupon: 0 });
    for (const effect of ['training', 'bond']) {
      for (let i = 0; i < 300 && !(run.offers[4]?.kind === 'contract' && run.offers[4].def.effect === effect); i++) run.reroll();
      run.buy(4);
    }
    expect(run.perks).toEqual({ hotPips: 1, retools: 1, coupon: 1 });
    // Training Program is once a run: the shop stops offering it.
    for (let i = 0; i < 30; i++) {
      expect(run.offers[4]?.kind === 'contract' && run.offers[4].def.effect).not.toBe('training');
      run.reroll();
    }
    run.continueToNextRound();
    expect(run.hotPipsLeft).toBe(DEFAULT_CONFIG.hotPips + 1);
    expect(run.retoolsLeft).toBe(DEFAULT_CONFIG.retoolsPerRound + 1);
    run.runShift();
    expect(run.lastPayout).toContainEqual({ source: 'Treasury Bond', amount: 1 });
  });
});

function make2() {
  return card(WORKSHOP, 'Apparel');
}
