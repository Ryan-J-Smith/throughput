import { describe, expect, it } from 'vitest';
import { initialPlaceholderState, placeholderReducer, PLACEHOLDER_RULES, toShellView } from './placeholderGame';
import type { PlaceholderAction, PlaceholderState } from './placeholderGame';

function run(state: PlaceholderState, ...actions: PlaceholderAction[]): PlaceholderState {
  return actions.reduce(placeholderReducer, state);
}

function selectBest(state: PlaceholderState, count: number): PlaceholderState {
  const best = [...state.hand].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, count);
  return run(state, ...best.map((c): PlaceholderAction => ({ type: 'toggleSelect', cardId: c.id })));
}

/** Play the highest-value cards until the round ends. */
function winRound(state: PlaceholderState): PlaceholderState {
  let s = state;
  while (s.screen === 'round') s = run(selectBest(s, PLACEHOLDER_RULES.maxSelected), { type: 'play' });
  return s;
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
    expect(s.round).toBe(1);
    expect(s.hand).toHaveLength(PLACEHOLDER_RULES.handSize);
    expect(new Set(s.hand.map((c) => c.id)).size).toBe(PLACEHOLDER_RULES.handSize);
  });

  it('play scores selected values, spends a play, and refills the hand', () => {
    const s0 = selectBest(started(), 2);
    const expected = s0.hand.filter((c) => s0.selectedIds.includes(c.id)).reduce((n, c) => n + (c.value ?? 0), 0);
    const s1 = run(s0, { type: 'play' });
    expect(s1.score).toBe(expected);
    expect(s1.playsLeft).toBe(PLACEHOLDER_RULES.playsPerRound - 1);
    expect(s1.selectedIds).toEqual([]);
    expect(s1.hand).toHaveLength(PLACEHOLDER_RULES.handSize);
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

  it('reaching the target moves to the shop and pays out', () => {
    const s = winRound(started());
    expect(s.screen).toBe('shop');
    expect(s.cash).toBeGreaterThan(PLACEHOLDER_RULES.startingCash);
    expect(s.offers).toHaveLength(PLACEHOLDER_RULES.shopSize);
  });

  it('running out of plays below target is game over', () => {
    let s = started();
    while (s.screen === 'round') {
      const worst = [...s.hand].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]!;
      s = run(s, { type: 'toggleSelect', cardId: worst.id }, { type: 'play' });
    }
    expect(s.screen).toBe('gameOver');
  });

  it('buying moves an offer into the modifier row and charges cash', () => {
    const shop = winRound(started());
    const offer = toShellView(shop);
    if (offer.screen !== 'shop') throw new Error('expected shop');
    const buyable = offer.offers.find((o) => o.canBuy)!;
    const s = run(shop, { type: 'buy', offerId: buyable.id });
    expect(s.cash).toBe(shop.cash - buyable.price);
    expect(s.modifiers).toHaveLength(1);
    expect(run(s, { type: 'buy', offerId: buyable.id })).toBe(s);
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
  });
});
