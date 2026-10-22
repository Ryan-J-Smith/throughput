import { describe, expect, it } from 'vitest';
import type { RunConfig } from '../../engine/run';
import type { ShellView } from '../../ui/types';
import { GameController } from '../GameController';
import { TestGame } from './fakes';
import type { TestCard } from './fakes';

type Screen<S extends ShellView['screen']> = Extract<ShellView, { screen: S }>;

function controller(overrides: Partial<RunConfig<TestCard>> = {}): GameController<TestCard> {
  return new GameController(new TestGame(overrides), () => 1);
}

function expectScreen<S extends ShellView['screen']>(c: GameController<TestCard>, screen: S): Screen<S> {
  const view = c.getView();
  if (view.screen !== screen) throw new Error(`expected ${screen}, got ${view.screen}`);
  return view as Screen<S>;
}

function select(c: GameController<TestCard>, n: number): void {
  for (const card of expectScreen(c, 'round').hand.slice(0, n)) c.onToggleSelect(card.id);
}

function lastToast(c: GameController<TestCard>): string | undefined {
  return c.getToasts().at(-1)?.message;
}

/** Plays three cards and lets the tally finish. */
function playThree(c: GameController<TestCard>): void {
  select(c, 3);
  c.onPlay();
  c.onTallyComplete();
}

/** Start, clear round 1, cash out: now in the shop with $8. */
function toShop(c: GameController<TestCard>): GameController<TestCard> {
  c.onStart();
  playThree(c);
  c.onCashOut();
  return c;
}

describe('GameController: lifecycle', () => {
  it('shows the title until started, then deals round 1', () => {
    const c = controller();
    expect(c.getView()).toEqual({ screen: 'title' });
    c.onStart();
    const round = expectScreen(c, 'round');
    expect(round.hand).toHaveLength(4);
    expect(round.hud).toMatchObject({ round: 1, targetScore: 10, currentScore: 0, playsLeft: 2, discardsLeft: 1, cash: 4 });
    expect(round.hud.boss).toBeUndefined();
    expect(round.handLocked).toBe(false);
    expect(round.maxSelected).toBe(3);
    expect(round.modifierRow).toEqual({ slots: 1, modifiers: [] });
  });

  it('caches the view until something changes and notifies subscribers', () => {
    const c = controller();
    let calls = 0;
    const unsubscribe = c.subscribe(() => calls++);
    expect(c.getView()).toBe(c.getView());
    const before = c.getView();
    c.onStart();
    expect(calls).toBe(1);
    expect(c.getView()).not.toBe(before);
    unsubscribe();
    c.onRestart();
    expect(calls).toBe(1);
  });

  it('restart begins a fresh run and clears toasts', () => {
    const c = controller();
    c.onStart();
    c.onPlay();
    expect(c.getToasts()).toHaveLength(1);
    const firstRun = c.run;
    c.onRestart();
    expect(c.run).not.toBe(firstRun);
    expect(c.getToasts()).toEqual([]);
  });
});

describe('GameController: playing', () => {
  it('selection is capped at the engine max', () => {
    const c = controller();
    c.onStart();
    select(c, 4);
    expect(expectScreen(c, 'round').selectedIds).toHaveLength(3);
  });

  it('enables Play and Discard only for a valid selection', () => {
    const c = controller();
    c.onStart();
    expect(expectScreen(c, 'round')).toMatchObject({ canPlay: false, canDiscard: false });
    select(c, 1);
    expect(expectScreen(c, 'round')).toMatchObject({ canPlay: true, canDiscard: true });
  });

  it('refuses invalid actions with the engine reason as a toast', () => {
    const c = controller();
    c.onStart();
    c.onPlay();
    expect(lastToast(c)).toBe('Select at least one card');
    select(c, 1);
    c.onDiscard();
    select(c, 1);
    c.onDiscard();
    expect(lastToast(c)).toBe('No discards left');
  });

  it('discard spends a discard, refills the hand and clears the selection', () => {
    const c = controller();
    c.onStart();
    select(c, 2);
    c.onDiscard();
    const round = expectScreen(c, 'round');
    expect(round.hud.discardsLeft).toBe(0);
    expect(round.hand).toHaveLength(4);
    expect(round.selectedIds).toEqual([]);
  });

  it('play shows a tally and holds back score and payout until it completes', () => {
    const c = controller();
    c.onStart();
    select(c, 3);
    c.onPlay();
    const tallying = expectScreen(c, 'round');
    expect(tallying.tally?.contributions.map((s) => [s.kind, s.sourceLabel, s.amount])).toEqual([
      ['add', 'card 5', 5],
      ['add', 'card 5', 5],
      ['add', 'card 5', 5],
    ]);
    expect(tallying.tally?.finalTotal).toBe(15);
    expect(tallying.handLocked).toBe(true);
    expect(tallying.canPlay).toBe(false);
    expect(tallying.hud.currentScore).toBe(0);
    expect(tallying.hud.cash).toBe(4);
    expect(c.run?.wallet.cash).toBe(8); // the engine has already paid

    const firstCard = tallying.hand[0]!.id;
    c.onToggleSelect(firstCard);
    expect(expectScreen(c, 'round').selectedIds).toEqual([]);
  });

  it('completing a winning tally shows the payout summary and a toast', () => {
    const c = controller();
    c.onStart();
    playThree(c);
    const summary = expectScreen(c, 'round');
    expect(summary.tally).toBeUndefined();
    expect(summary.hud.currentScore).toBe(15);
    expect(summary.hud.cash).toBe(4);
    expect(summary.summary).toEqual({
      heading: 'Round 1 cleared',
      lines: [
        { label: 'Round reward', amount: 3 },
        { label: 'Unused plays', amount: 1 },
      ],
      total: 4,
    });
    expect(lastToast(c)).toBe('Target hit!');
    expect(summary.handLocked).toBe(true);
  });

  it('a non-winning play unlocks the hand after its tally', () => {
    const c = controller({ target: () => 100 });
    c.onStart();
    playThree(c);
    const round = expectScreen(c, 'round');
    expect(round.summary).toBeUndefined();
    expect(round.hud.currentScore).toBe(15);
    expect(round.handLocked).toBe(false);
  });

  it('missing the target on the last play shows the tally first, then game over', () => {
    const c = controller({ target: () => 100 });
    c.onStart();
    playThree(c);
    select(c, 3);
    c.onPlay();
    expect(expectScreen(c, 'round').tally).toBeDefined();
    c.onTallyComplete();
    expect(expectScreen(c, 'gameOver').hud.currentScore).toBe(30);
  });
});

describe('GameController: shop', () => {
  it('cash out pays and opens the shop with offers, rarity and a next-round preview', () => {
    const c = toShop(controller());
    const shop = expectScreen(c, 'shop');
    expect(shop.hud.cash).toBe(8);
    expect(shop.offers.map((o) => [o.card.title, o.price, o.rarity]).sort()).toEqual([
      ['Plus', 3, 'common'],
      ['Pricy', 100, 'rare'],
    ]);
    expect(shop.nextRound).toEqual({
      round: 2,
      target: 20,
      boss: { name: 'Tight', description: 'One fewer play and card in hand' },
      ruleChanges: [
        { label: 'Plays', from: 2, to: 1 },
        { label: 'Hand size', from: 4, to: 3 },
      ],
    });
    expect(shop.rerollCost).toBe(2);
    expect(shop.canReroll).toBe(true);
  });

  it('buying an affordable modifier marks it sold and fills a slot', () => {
    const c = toShop(controller());
    const plus = expectScreen(c, 'shop').offers.find((o) => o.card.title === 'Plus')!;
    expect(plus.canBuy).toBe(true);
    c.onBuy(plus.id);
    const shop = expectScreen(c, 'shop');
    expect(shop.hud.cash).toBe(5);
    expect(shop.offers.find((o) => o.id === plus.id)).toMatchObject({ sold: true, canBuy: false });
    expect(shop.modifierRow.modifiers.map((m) => m.title)).toEqual(['Plus']);
  });

  it('refuses purchases with the engine reason', () => {
    const c = toShop(controller());
    const offers = expectScreen(c, 'shop').offers;
    const pricy = offers.find((o) => o.card.title === 'Pricy')!;
    expect(pricy.canBuy).toBe(false);
    c.onBuy(pricy.id);
    expect(lastToast(c)).toBe('Not enough cash');
    c.onBuy(offers.find((o) => o.card.title === 'Plus')!.id);
    c.onBuy(pricy.id);
    expect(lastToast(c)).toBe('No free modifier slot');
  });

  it('reroll restocks and ignores offer ids from the previous stock', () => {
    const c = toShop(controller());
    const old = expectScreen(c, 'shop').offers[0]!;
    c.onReroll();
    const shop = expectScreen(c, 'shop');
    expect(shop.hud.cash).toBe(6);
    expect(shop.rerollCost).toBe(3);
    expect(shop.offers.map((o) => o.id)).not.toContain(old.id);
    const toastsBefore = c.getToasts().length;
    c.onBuy(old.id);
    expect(expectScreen(c, 'shop').hud.cash).toBe(6);
    expect(c.getToasts()).toHaveLength(toastsBefore);
  });

  it('refuses a reroll it cannot afford', () => {
    const c = toShop(controller({ startingCash: 0, roundReward: () => 0, cashPerUnusedPlay: 0 }));
    expect(expectScreen(c, 'shop').canReroll).toBe(false);
    c.onReroll();
    expect(lastToast(c)).toBe('Not enough cash to reroll');
  });
});

describe('GameController: boss round and victory', () => {
  it('continue starts the boss round with its rules and shows the boss in the HUD', () => {
    const c = toShop(controller());
    c.onContinue();
    const round = expectScreen(c, 'round');
    expect(round.hud).toMatchObject({ round: 2, targetScore: 20, playsLeft: 1 });
    expect(round.hud.boss).toEqual({ name: 'Tight', description: 'One fewer play and card in hand' });
    expect(round.hand).toHaveLength(3);
  });

  it('modifier contributions appear in the tally, and clearing the final round ends in victory', () => {
    const c = toShop(controller());
    c.onBuy(expectScreen(c, 'shop').offers.find((o) => o.card.title === 'Plus')!.id);
    c.onContinue();
    select(c, 3);
    c.onPlay();
    const tally = expectScreen(c, 'round').tally!;
    expect(tally.contributions[0]).toMatchObject({ kind: 'mult', sourceLabel: 'Plus', runningB: 2 });
    expect(tally.finalTotal).toBe(30);
    c.onTallyComplete();
    const summary = expectScreen(c, 'round').summary!;
    expect(summary.heading).toBe('Boss round 2 cleared');
    expect(summary.lines.map((l) => l.label)).toContain('Plus bonus');
    c.onCashOut();
    expectScreen(c, 'victory');
  });
});

describe('GameController: toasts', () => {
  it('dismisses a toast by id', () => {
    const c = controller();
    c.onStart();
    c.onPlay();
    c.onPlay();
    const [first, second] = c.getToasts();
    c.onDismissToast(first!.id);
    expect(c.getToasts()).toEqual([second]);
  });
});
