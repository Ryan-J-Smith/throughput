// PLACEHOLDER game driver: just enough state to walk Title → Round → Shop → … → GameOver/Victory.
// It is deliberately dumb and deterministic (fixtures cycle in order; no RNG) and is meant to be
// replaced by the engine. Everything here maps onto ShellView/ShellActions, which is the real seam.

import type { CardView, HudView, ShellView, ShopOfferView } from '../types';
import { HAND_FIXTURES, MODIFIER_FIXTURES } from './fixtures';
import type { FixtureModifier } from './fixtures';
import { toggleSelection } from './selection';

export const PLACEHOLDER_RULES = {
  rounds: 3,
  handSize: 7,
  maxSelected: 5,
  playsPerRound: 4,
  discardsPerRound: 3,
  modifierSlots: 5,
  shopSize: 4,
  rerollCost: 3,
  startingCash: 10,
  targetForRound: (round: number) => 60 + round * 40,
  rewardForRound: (playsLeft: number) => 5 + playsLeft * 2,
} as const;

type Offer = { id: string; modifier: FixtureModifier; sold: boolean };

export type PlaceholderState = {
  screen: ShellView['screen'];
  round: number;
  score: number;
  playsLeft: number;
  discardsLeft: number;
  cash: number;
  hand: readonly CardView[];
  selectedIds: readonly string[];
  modifiers: readonly FixtureModifier[];
  offers: readonly Offer[];
  drawCounter: number;
  offerCounter: number;
};

export type PlaceholderAction =
  | { type: 'start' }
  | { type: 'toggleSelect'; cardId: string }
  | { type: 'play' }
  | { type: 'discard' }
  | { type: 'buy'; offerId: string }
  | { type: 'reroll' }
  | { type: 'continue' }
  | { type: 'restart' };

export function initialPlaceholderState(): PlaceholderState {
  return {
    screen: 'title',
    round: 1,
    score: 0,
    playsLeft: PLACEHOLDER_RULES.playsPerRound,
    discardsLeft: PLACEHOLDER_RULES.discardsPerRound,
    cash: PLACEHOLDER_RULES.startingCash,
    hand: [],
    selectedIds: [],
    modifiers: [],
    offers: [],
    drawCounter: 0,
    offerCounter: 0,
  };
}

function draw(state: PlaceholderState, count: number): Pick<PlaceholderState, 'hand' | 'drawCounter'> {
  const drawn: CardView[] = [];
  for (let i = 0; i < count; i++) {
    const n = state.drawCounter + i;
    const fixture = HAND_FIXTURES[n % HAND_FIXTURES.length]!;
    drawn.push({
      id: `${fixture.key}-${n}`,
      title: fixture.title,
      description: fixture.description,
      tags: fixture.tags,
      cost: fixture.cost,
      value: fixture.value,
    });
  }
  return { hand: [...state.hand, ...drawn], drawCounter: state.drawCounter + count };
}

function stockShop(state: PlaceholderState): Pick<PlaceholderState, 'offers' | 'offerCounter'> {
  const offers: Offer[] = [];
  for (let i = 0; i < PLACEHOLDER_RULES.shopSize; i++) {
    const n = state.offerCounter + i;
    const modifier = MODIFIER_FIXTURES[n % MODIFIER_FIXTURES.length]!;
    offers.push({ id: `offer-${n}`, modifier, sold: false });
  }
  return { offers, offerCounter: state.offerCounter + PLACEHOLDER_RULES.shopSize };
}

function startRound(state: PlaceholderState, round: number): PlaceholderState {
  const reset: PlaceholderState = {
    ...state,
    screen: 'round',
    round,
    score: 0,
    playsLeft: PLACEHOLDER_RULES.playsPerRound,
    discardsLeft: PLACEHOLDER_RULES.discardsPerRound,
    hand: [],
    selectedIds: [],
  };
  return { ...reset, ...draw(reset, PLACEHOLDER_RULES.handSize) };
}

function removeSelected(state: PlaceholderState): PlaceholderState {
  const remaining = state.hand.filter((c) => !state.selectedIds.includes(c.id));
  const trimmed = { ...state, hand: remaining, selectedIds: [] };
  return { ...trimmed, ...draw(trimmed, state.selectedIds.length) };
}

export function placeholderReducer(state: PlaceholderState, action: PlaceholderAction): PlaceholderState {
  switch (action.type) {
    case 'start':
    case 'restart':
      return startRound(initialPlaceholderState(), 1);

    case 'toggleSelect':
      if (state.screen !== 'round') return state;
      return { ...state, selectedIds: toggleSelection(state.selectedIds, action.cardId, PLACEHOLDER_RULES.maxSelected) };

    case 'play': {
      if (state.screen !== 'round' || state.playsLeft <= 0 || state.selectedIds.length === 0) return state;
      const gained = state.hand
        .filter((c) => state.selectedIds.includes(c.id))
        .reduce((sum, c) => sum + (c.value ?? 0), 0);
      const next = removeSelected({ ...state, score: state.score + gained, playsLeft: state.playsLeft - 1 });
      if (next.score >= PLACEHOLDER_RULES.targetForRound(next.round)) {
        const paid = { ...next, cash: next.cash + PLACEHOLDER_RULES.rewardForRound(next.playsLeft) };
        if (next.round >= PLACEHOLDER_RULES.rounds) return { ...paid, screen: 'victory' };
        return { ...paid, screen: 'shop', ...stockShop(paid) };
      }
      if (next.playsLeft <= 0) return { ...next, screen: 'gameOver' };
      return next;
    }

    case 'discard':
      if (state.screen !== 'round' || state.discardsLeft <= 0 || state.selectedIds.length === 0) return state;
      return removeSelected({ ...state, discardsLeft: state.discardsLeft - 1 });

    case 'buy': {
      if (state.screen !== 'shop') return state;
      const offer = state.offers.find((o) => o.id === action.offerId);
      if (!offer || !canBuy(state, offer)) return state;
      return {
        ...state,
        cash: state.cash - offer.modifier.price,
        modifiers: [...state.modifiers, offer.modifier],
        offers: state.offers.map((o) => (o.id === offer.id ? { ...o, sold: true } : o)),
      };
    }

    case 'reroll':
      if (state.screen !== 'shop' || state.cash < PLACEHOLDER_RULES.rerollCost) return state;
      return { ...state, cash: state.cash - PLACEHOLDER_RULES.rerollCost, ...stockShop(state) };

    case 'continue':
      if (state.screen !== 'shop') return state;
      return startRound(state, state.round + 1);
  }
}

function canBuy(state: PlaceholderState, offer: Offer): boolean {
  return !offer.sold && state.cash >= offer.modifier.price && state.modifiers.length < PLACEHOLDER_RULES.modifierSlots;
}

function toHud(state: PlaceholderState): HudView {
  return {
    round: state.round,
    targetScore: PLACEHOLDER_RULES.targetForRound(state.round),
    currentScore: state.score,
    playsLeft: state.playsLeft,
    discardsLeft: state.discardsLeft,
    cash: state.cash,
  };
}

/** Project placeholder state into the view the shell renders. */
export function toShellView(state: PlaceholderState): ShellView {
  const hud = toHud(state);
  const modifierRow = {
    slots: PLACEHOLDER_RULES.modifierSlots,
    modifiers: state.modifiers.map((m, i) => ({ id: `${m.key}-${i}`, title: m.title, description: m.description, tags: m.tags })),
  };

  switch (state.screen) {
    case 'title':
      return { screen: 'title' };
    case 'round':
      return {
        screen: 'round',
        hud,
        modifierRow,
        hand: state.hand,
        selectedIds: state.selectedIds,
        maxSelected: PLACEHOLDER_RULES.maxSelected,
        canPlay: state.playsLeft > 0 && state.selectedIds.length > 0,
        canDiscard: state.discardsLeft > 0 && state.selectedIds.length > 0,
      };
    case 'shop': {
      const offers: ShopOfferView[] = state.offers.map((o) => ({
        id: o.id,
        card: { id: o.id, title: o.modifier.title, description: o.modifier.description, tags: o.modifier.tags },
        price: o.modifier.price,
        sold: o.sold,
        canBuy: canBuy(state, o),
      }));
      return {
        screen: 'shop',
        hud,
        modifierRow,
        offers,
        rerollCost: PLACEHOLDER_RULES.rerollCost,
        canReroll: state.cash >= PLACEHOLDER_RULES.rerollCost,
      };
    }
    case 'gameOver':
      return { screen: 'gameOver', hud };
    case 'victory':
      return { screen: 'victory', hud };
  }
}
