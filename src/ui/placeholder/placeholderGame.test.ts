import { describe, expect, it } from 'vitest';
import { fakeTally, initialPlaceholderState, placeholderReducer, PLACEHOLDER_RULES, toShellView } from './placeholderGame';
import type { PlaceholderAction, PlaceholderState } from './placeholderGame';
import { MODIFIER_FIXTURES } from './fixtures';

function run(state: PlaceholderState, ...actions: PlaceholderAction[]): PlaceholderState {
  return actions.reduce(placeholderReducer, state);
}

function selectBest(state: PlaceholderState, count: number): PlaceholderState {
  const best = [...state.hand].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, count);
  return run(state, ...best.map((c): PlaceholderAction => ({ type: 'toggleSelect', cardId: c.id })));
}

/** Play the highest-value cards (and let each tally finish) until the round's summary shows. */
function clearRound(state: PlaceholderState): PlaceholderState {
  let s = state;
  while (s.screen === 'round' && s.phase === 'playing') {
    s = run(selectBest(s, PLACEHOLDER_RULES.maxSelected), { type: 'play' }, { type: 'tallyComplete' });
  }
  return s;
}

function winRound(state: PlaceholderState): PlaceholderState {
  return run(clearRound(state), { type: 'cashOut' });
}

function started(): PlaceholderState {
  return run(initialPlaceholderState(), { type: 'start' });
}

describe('placeholderReducer', () => {
  it('starts on the title screen', () => {
    expect(toShellView(initialPlaceholderState()).screen).toBe('title');
  });

  it('start deals a full hand into round 1', () => {
    const s = started();
    expect(s.screen).toBe('round');
    expect(s.phase).toBe('playing');
    expect(s.round).toBe(1);
    expect(s.hand).toHaveLength(PLACEHOLDER_RULES.handSize);
    expect(new Set(s.hand.map((c) => c.id)).size).toBe(PLACEHOLDER_RULES.handSize);
  });

  it('dealt cards carry tooltips with glossary entries for their tags', () => {
    const card = started().hand[0]!;
    expect(card.tooltip?.body).toBeTruthy();
    expect(card.tooltip?.glossary.map((g) => g.term)).toEqual(card.tags);
  });

  it('play starts a tally, spends a play, refills the hand, and locks input', () => {
    const s0 = selectBest(started(), 2);
    const expected = s0.hand.filter((c) => s0.selectedIds.includes(c.id)).reduce((n, c) => n + (c.value ?? 0), 0);
    const s1 = run(s0, { type: 'play' });
    expect(s1.phase).toBe('tallying');
    expect(s1.tally?.finalTotal).toBe(expected);
    expect(s1.score).toBe(0);
    expect(s1.playsLeft).toBe(PLACEHOLDER_RULES.playsPerRound - 1);
    expect(s1.hand).toHaveLength(PLACEHOLDER_RULES.handSize);

    const view = toShellView(s1);
    if (view.screen !== 'round') throw new Error('expected round');
    expect(view.handLocked).toBe(true);
    expect(view.canPlay).toBe(false);
    expect(run(s1, { type: 'toggleSelect', cardId: s1.hand[0]!.id })).toBe(s1);
  });

  it('tallyComplete applies the tally score and unlocks', () => {
    const s0 = run(selectBest(started(), 2), { type: 'play' });
    const s1 = run(s0, { type: 'tallyComplete' });
    expect(s1.score).toBe(s0.tally!.finalTotal);
    expect(s1.tally).toBeUndefined();
    expect(s1.phase).toBe('playing');
  });

  it('discard spends a discard without scoring', () => {
    const s = run(selectBest(started(), 3), { type: 'discard' });
    expect(s.score).toBe(0);
    expect(s.discardsLeft).toBe(PLACEHOLDER_RULES.discardsPerRound - 1);
    expect(s.hand).toHaveLength(PLACEHOLDER_RULES.handSize);
  });

  it('ignores play with nothing selected', () => {
    const s = started();
    expect(run(s, { type: 'play' })).toBe(s);
  });

  it('hitting the target shows a summary and a success toast', () => {
    const s = clearRound(started());
    expect(s.phase).toBe('summary');
    expect(s.summary?.lines.length).toBeGreaterThan(0);
    expect(s.summary?.total).toBe(s.summary?.lines.reduce((n, l) => n + l.amount, 0));
    expect(s.toasts.at(-1)).toMatchObject({ kind: 'success', message: 'Target hit!' });
  });

  it('cashing out pays the summary total and opens the shop', () => {
    const summary = clearRound(started());
    const s = run(summary, { type: 'cashOut' });
    expect(s.screen).toBe('shop');
    expect(s.cash).toBe(summary.cash + summary.summary!.total);
    expect(s.offers).toHaveLength(PLACEHOLDER_RULES.shopSize);
  });

  it('running out of plays below target is game over', () => {
    let s = started();
    while (s.screen === 'round') {
      const worst = [...s.hand].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]!;
      s = run(s, { type: 'toggleSelect', cardId: worst.id }, { type: 'play' }, { type: 'tallyComplete' });
    }
    expect(s.screen).toBe('gameOver');
  });

  it('buying moves an offer into the modifier row and charges cash', () => {
    const shop = winRound(started());
    const view = toShellView(shop);
    if (view.screen !== 'shop') throw new Error('expected shop');
    const buyable = view.offers.find((o) => o.canBuy)!;
    const s = run(shop, { type: 'buy', offerId: buyable.id });
    expect(s.cash).toBe(shop.cash - buyable.price);
    expect(s.modifiers).toHaveLength(1);
    expect(run(s, { type: 'buy', offerId: buyable.id })).toBe(s);
  });

  it('buying without enough cash refuses with a toast', () => {
    const shop = { ...winRound(started()), cash: 0 };
    const s = run(shop, { type: 'buy', offerId: shop.offers[0]!.id });
    expect(s.modifiers).toEqual([]);
    expect(s.cash).toBe(0);
    expect(s.toasts.at(-1)).toMatchObject({ kind: 'error', message: 'Not enough cash' });
  });

  it('rerolling without enough cash refuses with a toast', () => {
    const shop = { ...winRound(started()), cash: 0 };
    const s = run(shop, { type: 'reroll' });
    expect(s.offers).toBe(shop.offers);
    expect(s.toasts.at(-1)?.message).toBe('Not enough cash');
  });

  it('dismissToast removes only that toast', () => {
    const s = run({ ...winRound(started()), cash: 0 }, { type: 'reroll' }, { type: 'reroll' });
    const [first, second] = s.toasts.slice(-2);
    const after = run(s, { type: 'dismissToast', toastId: first!.id });
    expect(after.toasts.map((t) => t.id)).not.toContain(first!.id);
    expect(after.toasts.map((t) => t.id)).toContain(second!.id);
  });

  it('shop offers expose rarity', () => {
    const view = toShellView(winRound(started()));
    if (view.screen !== 'shop') throw new Error('expected shop');
    expect(view.offers.every((o) => o.rarity !== undefined)).toBe(true);
  });

  it('reroll replaces offers and charges the reroll cost', () => {
    const shop = winRound(started());
    const s = run(shop, { type: 'reroll' });
    expect(s.cash).toBe(shop.cash - PLACEHOLDER_RULES.rerollCost);
    expect(s.offers.map((o) => o.id)).not.toEqual(shop.offers.map((o) => o.id));
  });

  it('continue starts the next round fresh', () => {
    const s = run(winRound(started()), { type: 'continue' });
    expect(s.screen).toBe('round');
    expect(s.round).toBe(2);
    expect(s.score).toBe(0);
    expect(s.playsLeft).toBe(PLACEHOLDER_RULES.playsPerRound);
  });

  it('clearing the final round is victory', () => {
    let s = started();
    for (let r = 1; r < PLACEHOLDER_RULES.rounds; r++) s = run(winRound(s), { type: 'continue' });
    s = winRound(s);
    expect(s.screen).toBe('victory');
  });

  it('restart returns to round 1 with starting resources', () => {
    const s = run(winRound(started()), { type: 'restart' });
    expect(s.screen).toBe('round');
    expect(s.round).toBe(1);
    expect(s.cash).toBe(PLACEHOLDER_RULES.startingCash);
    expect(s.modifiers).toEqual([]);
    expect(s.toasts).toEqual([]);
  });
});

describe('fakeTally', () => {
  const played = [
    { id: 'a', title: 'A', description: '', tags: [], value: 10 },
    { id: 'b', title: 'B', description: '', tags: [], value: 5 },
  ];

  it('without modifiers totals the card values', () => {
    const t = fakeTally('t', played, []);
    expect(t.finalTotal).toBe(15);
    expect(t.contributions.map((c) => c.kind)).toEqual(['note', 'add', 'add']);
  });

  it('alternates +mult and ×mult for modifiers and reports running values', () => {
    const t = fakeTally('t', played, MODIFIER_FIXTURES.slice(0, 2));
    expect(t.contributions.map((c) => c.kind)).toEqual(['note', 'add', 'add', 'mult', 'xmult']);
    expect(t.contributions.at(-1)).toMatchObject({ runningA: 15, runningB: 3, total: 45 });
    expect(t.finalTotal).toBe(45);
  });
});
