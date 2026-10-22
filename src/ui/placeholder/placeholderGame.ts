// PLACEHOLDER game driver: just enough state to walk Title → Round → Shop → … → GameOver/Victory.
// It is deliberately dumb and deterministic (fixtures cycle in order; no RNG) and is meant to be
// replaced by the engine. Everything here maps onto ShellView/ShellActions, which is the real seam.

import type {
  CardView,
  HudView,
  RoundSummaryView,
  ScoreContributionView,
  ScoreTallyView,
  ShellView,
  ShopOfferView,
  ToastKind,
  ToastView,
  TooltipView,
} from '../types';
import { GLOSSARY, HAND_FIXTURES, MODIFIER_FIXTURES } from './fixtures';
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
  baseReward: 5,
  perUnusedPlay: 2,
  interestPer: 5,
  interestCap: 5,
} as const;

type Offer = { id: string; modifier: FixtureModifier; sold: boolean };

/** Within the round screen: choosing cards, watching a tally, or cashing out. */
export type RoundPhase = 'playing' | 'tallying' | 'summary';

export type PlaceholderState = {
  screen: ShellView['screen'];
  phase: RoundPhase;
  round: number;
  score: number;
  playsLeft: number;
  discardsLeft: number;
  cash: number;
  hand: readonly CardView[];
  selectedIds: readonly string[];
  modifiers: readonly FixtureModifier[];
  offers: readonly Offer[];
  tally: ScoreTallyView | undefined;
  summary: RoundSummaryView | undefined;
  toasts: readonly ToastView[];
  drawCounter: number;
  offerCounter: number;
  tallyCounter: number;
  toastCounter: number;
};

export type PlaceholderAction =
  | { type: 'start' }
  | { type: 'toggleSelect'; cardId: string }
  | { type: 'play' }
  | { type: 'discard' }
  | { type: 'tallyComplete' }
  | { type: 'cashOut' }
  | { type: 'buy'; offerId: string }
  | { type: 'reroll' }
  | { type: 'continue' }
  | { type: 'restart' }
  | { type: 'dismissToast'; toastId: string };

export function initialPlaceholderState(): PlaceholderState {
  return {
    screen: 'title',
    phase: 'playing',
    round: 1,
    score: 0,
    playsLeft: PLACEHOLDER_RULES.playsPerRound,
    discardsLeft: PLACEHOLDER_RULES.discardsPerRound,
    cash: PLACEHOLDER_RULES.startingCash,
    hand: [],
    selectedIds: [],
    modifiers: [],
    offers: [],
    tally: undefined,
    summary: undefined,
    toasts: [],
    drawCounter: 0,
    offerCounter: 0,
    tallyCounter: 0,
    toastCounter: 0,
  };
}

function tooltipFor(details: string, tags: readonly string[]): TooltipView {
  return {
    body: details,
    glossary: tags.flatMap((term) => {
      const definition = GLOSSARY[term];
      return definition === undefined ? [] : [{ term, definition }];
    }),
  };
}

function toast(state: PlaceholderState, kind: ToastKind, message: string): PlaceholderState {
  return {
    ...state,
    toasts: [...state.toasts, { id: `toast-${state.toastCounter}`, kind, message }],
    toastCounter: state.toastCounter + 1,
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
      tooltip: tooltipFor(fixture.details, fixture.tags),
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
    phase: 'playing',
    round,
    score: 0,
    playsLeft: PLACEHOLDER_RULES.playsPerRound,
    discardsLeft: PLACEHOLDER_RULES.discardsPerRound,
    hand: [],
    selectedIds: [],
    tally: undefined,
    summary: undefined,
  };
  return { ...reset, ...draw(reset, PLACEHOLDER_RULES.handSize) };
}

function removeSelected(state: PlaceholderState): PlaceholderState {
  const remaining = state.hand.filter((c) => !state.selectedIds.includes(c.id));
  const trimmed = { ...state, hand: remaining, selectedIds: [] };
  return { ...trimmed, ...draw(trimmed, state.selectedIds.length) };
}

/**
 * Fake chips-times-mult breakdown: cards add to A, owned modifiers alternate +mult and ×mult.
 * Exists only to exercise ScoreTally; it is not a scoring proposal.
 */
export function fakeTally(id: string, played: readonly CardView[], modifiers: readonly FixtureModifier[]): ScoreTallyView {
  let a = 0;
  let b = 1;
  const steps: ScoreContributionView[] = [
    { id: `${id}-note`, sourceLabel: `${played.length}-card play`, kind: 'note', amount: 0, runningA: a, runningB: b, total: 0 },
  ];
  for (const card of played) {
    const amount = card.value ?? 0;
    a += amount;
    steps.push({ id: `${id}-${card.id}`, sourceLabel: card.title, kind: 'add', amount, runningA: a, runningB: b, total: a * b });
  }
  modifiers.forEach((m, i) => {
    const kind = i % 2 === 0 ? 'mult' : 'xmult';
    const amount = kind === 'mult' ? 1 : 1.5;
    b = kind === 'mult' ? b + amount : b * amount;
    steps.push({ id: `${id}-${m.key}-${i}`, sourceLabel: m.title, kind, amount, runningA: a, runningB: b, total: Math.floor(a * b) });
  });
  return { id, contributions: steps, finalTotal: Math.floor(a * b), labelA: 'Base', labelB: 'Mult' };
}

function roundSummary(state: PlaceholderState): RoundSummaryView {
  const r = PLACEHOLDER_RULES;
  const lines = [
    { label: 'Round reward', amount: r.baseReward },
    { label: `Unused plays (${state.playsLeft} × $${r.perUnusedPlay})`, amount: state.playsLeft * r.perUnusedPlay },
    { label: `Interest ($1 per $${r.interestPer}, max $${r.interestCap})`, amount: Math.min(r.interestCap, Math.floor(state.cash / r.interestPer)) },
  ];
  return { heading: `Round ${state.round} cleared`, lines, total: lines.reduce((n, l) => n + l.amount, 0) };
}

export function placeholderReducer(state: PlaceholderState, action: PlaceholderAction): PlaceholderState {
  switch (action.type) {
    case 'start':
    case 'restart':
      return startRound(initialPlaceholderState(), 1);

    case 'toggleSelect':
      if (state.screen !== 'round' || state.phase !== 'playing') return state;
      return { ...state, selectedIds: toggleSelection(state.selectedIds, action.cardId, PLACEHOLDER_RULES.maxSelected) };

    case 'play': {
      if (state.screen !== 'round' || state.phase !== 'playing') return state;
      if (state.playsLeft <= 0 || state.selectedIds.length === 0) return state;
      const played = state.hand.filter((c) => state.selectedIds.includes(c.id));
      const tally = fakeTally(`tally-${state.tallyCounter}`, played, state.modifiers);
      return {
        ...removeSelected(state),
        phase: 'tallying',
        playsLeft: state.playsLeft - 1,
        tally,
        tallyCounter: state.tallyCounter + 1,
      };
    }

    case 'tallyComplete': {
      if (state.screen !== 'round' || state.phase !== 'tallying' || !state.tally) return state;
      const scored = { ...state, score: state.score + state.tally.finalTotal, tally: undefined };
      if (scored.score >= PLACEHOLDER_RULES.targetForRound(scored.round)) {
        return toast({ ...scored, phase: 'summary', summary: roundSummary(scored) }, 'success', 'Target hit!');
      }
      if (scored.playsLeft <= 0) return { ...scored, phase: 'playing', screen: 'gameOver' };
      return { ...scored, phase: 'playing' };
    }

    case 'cashOut': {
      if (state.screen !== 'round' || state.phase !== 'summary' || !state.summary) return state;
      const paid = { ...state, cash: state.cash + state.summary.total, summary: undefined, phase: 'playing' as const };
      if (paid.round >= PLACEHOLDER_RULES.rounds) return { ...paid, screen: 'victory' };
      return { ...paid, screen: 'shop', ...stockShop(paid) };
    }

    case 'discard':
      if (state.screen !== 'round' || state.phase !== 'playing') return state;
      if (state.discardsLeft <= 0 || state.selectedIds.length === 0) return state;
      return removeSelected({ ...state, discardsLeft: state.discardsLeft - 1 });

    case 'buy': {
      if (state.screen !== 'shop') return state;
      const offer = state.offers.find((o) => o.id === action.offerId);
      if (!offer || offer.sold) return state;
      if (state.cash < offer.modifier.price) return toast(state, 'error', 'Not enough cash');
      if (state.modifiers.length >= PLACEHOLDER_RULES.modifierSlots) return toast(state, 'error', 'Modifier slots full');
      return {
        ...state,
        cash: state.cash - offer.modifier.price,
        modifiers: [...state.modifiers, offer.modifier],
        offers: state.offers.map((o) => (o.id === offer.id ? { ...o, sold: true } : o)),
      };
    }

    case 'reroll':
      if (state.screen !== 'shop') return state;
      if (state.cash < PLACEHOLDER_RULES.rerollCost) return toast(state, 'error', 'Not enough cash');
      return { ...state, cash: state.cash - PLACEHOLDER_RULES.rerollCost, ...stockShop(state) };

    case 'continue':
      if (state.screen !== 'shop') return state;
      return startRound(state, state.round + 1);

    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.toastId) };
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
    modifiers: state.modifiers.map((m, i) => ({
      id: `${m.key}-${i}`,
      title: m.title,
      description: m.description,
      tags: m.tags,
      tooltip: tooltipFor(m.details, m.tags),
    })),
  };

  switch (state.screen) {
    case 'title':
      return { screen: 'title' };
    case 'round': {
      const playing = state.phase === 'playing';
      return {
        screen: 'round',
        hud,
        modifierRow,
        hand: state.hand,
        selectedIds: state.selectedIds,
        maxSelected: PLACEHOLDER_RULES.maxSelected,
        canPlay: playing && state.playsLeft > 0 && state.selectedIds.length > 0,
        canDiscard: playing && state.discardsLeft > 0 && state.selectedIds.length > 0,
        handLocked: !playing,
        tally: state.tally,
        summary: state.summary,
      };
    }
    case 'shop': {
      const offers: ShopOfferView[] = state.offers.map((o) => ({
        id: o.id,
        card: {
          id: o.id,
          title: o.modifier.title,
          description: o.modifier.description,
          tags: o.modifier.tags,
          tooltip: tooltipFor(o.modifier.details, o.modifier.tags),
        },
        price: o.modifier.price,
        sold: o.sold,
        canBuy: canBuy(state, o),
        rarity: o.modifier.rarity,
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

export function toToasts(state: PlaceholderState): readonly ToastView[] {
  return state.toasts;
}
