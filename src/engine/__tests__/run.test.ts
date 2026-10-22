import { describe, expect, it } from 'vitest';
import type { CardDef } from '../deck';
import { EngineError } from '../errors';
import type { EngineEvent } from '../modifiers';
import { Registry } from '../registry';
import type { Run } from '../run';
import { HookModifier, RARITIES, RecordingModifier, card, cardDef, makeRun, modifierDef } from './fakes';
import type { TestCard } from './fakes';

const playFirst = (run: Run<TestCard>, n = 3) => run.play(run.deck.hand.slice(0, n));

function toPlaying(run: Run<TestCard>): Run<TestCard> {
  run.start();
  run.startRound();
  return run;
}

function toShop(run: Run<TestCard>): Run<TestCard> {
  toPlaying(run);
  playFirst(run);
  run.enterShop();
  return run;
}

describe('Run lifecycle', () => {
  it('walks setup → roundStart → playing → roundEnd → shop → next roundStart', () => {
    const run = makeRun();
    expect(run.phase).toBe('setup');
    run.start();
    expect(run.phase).toBe('roundStart');
    expect(run.round).toEqual({ number: 1, isBoss: false, target: 10 });

    run.startRound();
    expect(run.phase).toBe('playing');
    expect(run.deck.hand).toHaveLength(4);
    expect(run.playsLeft).toBe(2);
    expect(run.discardsLeft).toBe(1);

    const result = playFirst(run);
    expect(result.total).toBe(15);
    expect(run.roundScore).toBe(15);
    expect(run.phase).toBe('roundEnd');

    run.enterShop();
    expect(run.phase).toBe('shop');
    expect(run.shop.offers).toHaveLength(2);

    run.leaveShop();
    expect(run.phase).toBe('roundStart');
    expect(run.round).toEqual({ number: 2, isBoss: false, target: 20 });
  });

  it('marks every K-th round as a boss and passes that to the target function', () => {
    const run = toShop(makeRun({ rounds: 5, bossEvery: 2 }));
    run.leaveShop();
    expect(run.round).toEqual({ number: 2, isBoss: true, target: 40 });
  });

  it('wins after clearing the final round, without visiting the shop', () => {
    const run = makeRun({ rounds: 2, target: () => 10 });
    toShop(run);
    run.leaveShop();
    run.startRound();
    playFirst(run);
    expect(run.phase).toBe('won');
    expect(() => run.enterShop()).toThrow(EngineError);
  });

  it('loses when plays run out below the target', () => {
    const log: string[] = [];
    const run = makeRun({ target: () => 1000 });
    run.modifiers.add(new RecordingModifier('rec', log));
    toPlaying(run);
    playFirst(run);
    expect(run.phase).toBe('playing');
    playFirst(run);
    expect(run.phase).toBe('lost');
    expect(log.at(-1)).toBe('rec:roundEnd');
    expect(run.whyCannotPlay(run.deck.hand.slice(0, 1))).toBe('Not in a round');
  });

  it('loses when no cards can be dealt', () => {
    const run = toPlaying(makeRun({ startingDeck: [] }));
    expect(run.phase).toBe('lost');
  });

  it('rejects actions in the wrong phase', () => {
    const run = makeRun();
    expect(() => run.startRound()).toThrow(EngineError);
    expect(() => run.leaveShop()).toThrow(EngineError);
    expect(run.whyCannotBuy(0)).toBe('Shop is closed');
    expect(run.whyCannotReroll()).toBe('Shop is closed');
  });

  it('is deterministic for a seed', () => {
    const deck = Array.from({ length: 12 }, (_, i) => card(i));
    const a = toPlaying(makeRun({ startingDeck: deck }, 99));
    const b = toPlaying(makeRun({ startingDeck: deck }, 99));
    expect(a.deck.hand).toEqual(b.deck.hand);
  });
});

describe('Run playing', () => {
  it('validates selections', () => {
    const run = toPlaying(makeRun());
    expect(run.whyCannotPlay([])).toBe('Select at least one card');
    expect(run.whyCannotPlay(run.deck.hand.slice(0, 4))).toBe('Select at most 3 cards');
    expect(run.whyCannotPlay([card(5)])).toBe('Selected cards are not in hand');
    expect(() => run.play([card(5)])).toThrow(EngineError);
  });

  it('discard() spends a discard, refills the hand, and notifies modifiers', () => {
    const log: string[] = [];
    const run = makeRun();
    run.modifiers.add(new RecordingModifier('rec', log));
    toPlaying(run);
    const tossed = run.deck.hand.slice(0, 2);
    run.discard(tossed);
    expect(run.discardsLeft).toBe(0);
    expect(run.deck.hand).toHaveLength(4);
    expect(run.deck.discardPile).toEqual(tossed);
    expect(log.at(-1)).toBe('rec:discard');
    expect(run.whyCannotDiscard(run.deck.hand.slice(0, 1))).toBe('No discards left');
  });

  it('emits score events in order: beforeScore, scoreStep per card, afterPlay, roundEnd', () => {
    const log: string[] = [];
    const run = makeRun();
    run.modifiers.add(new RecordingModifier('rec', log));
    toPlaying(run);
    log.length = 0;
    playFirst(run, 2);
    expect(log).toEqual(['rec:beforeScore', 'rec:scoreStep', 'rec:scoreStep', 'rec:afterPlay', 'rec:roundEnd']);
  });

  it('lets modifiers mutate the score, and slot order changes the result', () => {
    const plusOne = new HookModifier('plus', 'beforeScore', (e) => {
      if (e.type === 'beforeScore') e.score.add('multiplier', 1, 'plus');
    });
    const times2 = new HookModifier('times2', 'beforeScore', (e) => {
      if (e.type === 'beforeScore') e.score.multiply('multiplier', 2, 'times2');
    });

    const a = makeRun();
    a.modifiers.add(plusOne);
    a.modifiers.add(times2);
    toPlaying(a);
    const ra = playFirst(a);
    expect(ra.total).toBe(15 * 4); // (1 + 1) * 2

    const b = makeRun();
    b.modifiers.add(times2);
    b.modifiers.add(plusOne);
    toPlaying(b);
    const rb = playFirst(b);
    expect(rb.total).toBe(15 * 3); // 1 * 2 + 1
    expect(rb.score.log.map((c) => c.source)).toEqual(['play', 'times2', 'plus', 'card', 'card', 'card']);
  });

  it('scoreStep carries each scoring card and its index', () => {
    const seen: [number, number][] = [];
    const run = makeRun({ startingDeck: [card(1), card(2), card(3), card(4)] });
    run.modifiers.add(
      new HookModifier('watch', 'scoreStep', (e) => {
        if (e.type === 'scoreStep') seen.push([e.index, e.card.value]);
      }),
    );
    toPlaying(run);
    const played = run.deck.hand.slice(0, 3);
    run.play(played);
    expect(seen).toEqual(played.map((c, i) => [i, c.value]));
  });

  it('lets modifiers grant plays at round start', () => {
    const run = makeRun();
    run.modifiers.add(
      new HookModifier('extra', 'roundStart', (e) => {
        if (e.type === 'roundStart') e.run.playsLeft += 1;
      }),
    );
    toPlaying(run);
    expect(run.playsLeft).toBe(3);
  });
});

describe('Run economy', () => {
  it('pays round reward, unused plays and interest on a win', () => {
    const run = toPlaying(makeRun({ startingCash: 12 }));
    playFirst(run);
    expect(run.payout?.lines).toEqual([
      { source: 'Round reward', amount: 3 },
      { source: 'Unused plays', amount: 1 },
      { source: 'Interest', amount: 2 },
    ]);
    expect(run.wallet.cash).toBe(18);
  });

  it('lets modifiers add payout lines at round end', () => {
    const run = makeRun();
    run.modifiers.add(
      new HookModifier('bonus', 'roundEnd', (e) => {
        if (e.type === 'roundEnd') e.payout.add('bonus', 5);
      }),
    );
    toPlaying(run);
    playFirst(run);
    expect(run.wallet.cash).toBe(4 + 3 + 1 + 5);
  });
});

describe('Run shop', () => {
  it('buying a modifier puts it in a slot and hides it from later stock', () => {
    const run = toShop(makeRun({ startingCash: 20 }));
    const offer = run.buy(0);
    expect(offer.def.kind).toBe('modifier');
    expect(run.modifiers.modifiers.map((m) => m.id)).toEqual([offer.def.id]);
    for (let i = 0; i < 3; i++) {
      run.reroll();
      expect(run.shop.offers.map((o) => o?.def.id)).not.toContain(offer.def.id);
    }
  });

  it('refuses modifier purchases when slots are full', () => {
    const run = toShop(makeRun({ startingCash: 20, modifierSlots: 0 }));
    expect(run.whyCannotBuy(0)).toBe('No free modifier slot');
    expect(() => run.buy(0)).toThrow(EngineError);
  });

  it('buying a card adds it to the deck and emits purchase', () => {
    const log: string[] = [];
    const cards = new Registry<CardDef<TestCard>>(RARITIES);
    cards.register(cardDef('ace', 11));
    const run = makeRun({
      startingCash: 20,
      shop: { slots: 1, pools: [{ id: 'cards', registry: cards, weight: 1 }], rerollBaseCost: 1, rerollCostIncrement: 1, sellRate: 0.5 },
    });
    run.modifiers.add(new RecordingModifier('rec', log));
    toShop(run);
    run.buy(0);
    expect(run.deck.allCards.filter((c) => c.value === 11)).toHaveLength(1);
    expect(log.at(-1)).toBe('rec:purchase');
  });

  it('reroll() spends cash with escalating cost', () => {
    const run = toShop(makeRun({ startingCash: 20 }));
    const before = run.wallet.cash;
    run.reroll();
    run.reroll();
    expect(run.wallet.cash).toBe(before - 2 - 3);
  });

  it('sell() refunds part of the price and the sold modifier sees the event', () => {
    const events: EngineEvent<TestCard>['type'][] = [];
    const run = makeRun({ startingCash: 0 });
    const sold = new HookModifier('sold', 'sell', (e, self) => {
      if (e.type === 'sell' && e.modifier === self) events.push(e.type);
    });
    run.modifiers.add(sold);
    expect(run.whyCannotSell(sold)).toBe('Run is not active');
    run.start();
    expect(run.sell(sold)).toBe(3);
    expect(events).toEqual(['sell']);
    expect(run.wallet.cash).toBe(3);
    expect(run.modifiers.modifiers).toHaveLength(0);
    expect(run.whyCannotSell(sold)).toBe('Modifier is not owned');
  });

  it('modifier defs create fresh instances per purchase', () => {
    const def = modifierDef('x');
    expect(def.create()).not.toBe(def.create());
  });
});
