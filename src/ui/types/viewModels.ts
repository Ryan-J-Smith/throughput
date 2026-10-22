// Display-only view models. The UI renders these and reports intent through callbacks;
// whatever owns game state (placeholder now, engine later) is responsible for producing them.

export type GlossaryEntryView = {
  term: string;
  definition: string;
};

/** Long-form detail shown on hover/tap. Glossary entries arrive already resolved. */
export type TooltipView = {
  body: string;
  glossary: readonly GlossaryEntryView[];
};

export type CardView = {
  id: string;
  title: string;
  description: string;
  tags: readonly string[];
  cost?: number;
  value?: number;
  disabled?: boolean;
  tooltip?: TooltipView;
  /** Department colour key from the theme's accent map (e.g. "red", "teal"); presentational only. */
  accent?: string;
};

export type ModifierView = {
  id: string;
  title: string;
  description: string;
  tags: readonly string[];
  tooltip?: TooltipView;
  /** Department colour key, as on CardView. */
  accent?: string;
  /** Cash received if sold now. */
  sellValue: number;
  /** Styling hint only; Sell stays clickable so the state owner can explain a refusal. */
  canSell: boolean;
};

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type ShopOfferView = {
  id: string;
  card: CardView;
  price: number;
  /** Styling hint only; Buy stays clickable so the state owner can explain a refusal. */
  canBuy: boolean;
  sold: boolean;
  rarity?: Rarity;
  /** Undiscounted price when `price` is a markdown; shows a SALE stamp. Presentational. */
  listPrice?: number;
  /** Where a purchase lands, so the UI can animate it there. Presentational. */
  destination?: 'modifiers' | 'deck';
};

export type ScoreContributionKind = 'add' | 'mult' | 'xmult' | 'note';

/**
 * One step of a score breakdown, in the order it should be revealed. Running values are
 * whatever the state owner says they are after this step; the UI never recomputes them.
 */
export type ScoreContributionView = {
  id: string;
  sourceLabel: string;
  kind: ScoreContributionKind;
  amount: number;
  runningA?: number;
  runningB?: number;
  total?: number;
};

export type ScoreTallyView = {
  /** Changes per play so the animation restarts. */
  id: string;
  contributions: readonly ScoreContributionView[];
  finalTotal: number;
  labelA?: string;
  labelB?: string;
};

export type TallySpeed = 'slow' | 'normal' | 'fast';

export type SummaryLineView = {
  label: string;
  amount: number;
};

export type RoundSummaryView = {
  heading: string;
  lines: readonly SummaryLineView[];
  total: number;
};

export type ToastKind = 'success' | 'error' | 'info';

export type ToastView = {
  id: string;
  kind: ToastKind;
  message: string;
};

export type BossView = {
  name: string;
  description: string;
};

export type HudView = {
  round: number;
  targetScore: number;
  currentScore: number;
  playsLeft: number;
  discardsLeft: number;
  cash: number;
  /** The rule in force this round, when it is a boss round. */
  boss?: BossView;
};

export type RuleChangeView = {
  label: string;
  from: number;
  to: number;
};

/** Preview of the round after the shop. */
export type NextRoundView = {
  round: number;
  target: number;
  boss?: BossView;
  /** Only rules that differ from the usual values. */
  ruleChanges: readonly RuleChangeView[];
};

export type ModifierRowView = {
  /** In slot order, which is the order they apply. */
  modifiers: readonly ModifierView[];
  slots: number;
  /** True while selling and reordering are paused (e.g. a tally is playing). */
  locked: boolean;
};

/** Display order for the hand: as dealt, or by presenter-provided sort keys. */
export type HandSort = 'dealt' | 'value' | 'group';

export type ShellView =
  | { screen: 'title' }
  | {
      screen: 'round';
      hud: HudView;
      modifierRow: ModifierRowView;
      /** In display order (see handSort). */
      hand: readonly CardView[];
      handSort: HandSort;
      selectedIds: readonly string[];
      maxSelected: number;
      canPlay: boolean;
      canDiscard: boolean;
      /** True while a tally or summary is showing; hand selection is ignored. */
      handLocked: boolean;
      tally?: ScoreTallyView;
      summary?: RoundSummaryView;
    }
  | {
      screen: 'shop';
      hud: HudView;
      modifierRow: ModifierRowView;
      offers: readonly ShopOfferView[];
      nextRound?: NextRoundView;
      rerollCost: number;
      /** Styling hint only, like ShopOfferView.canBuy. */
      canReroll: boolean;
    }
  | { screen: 'gameOver'; hud: HudView }
  | { screen: 'victory'; hud: HudView };

export type ScreenName = ShellView['screen'];

export type ShellActions = {
  onStart: () => void;
  onToggleSelect: (cardId: string) => void;
  onPlay: () => void;
  onDiscard: () => void;
  onBuy: (offerId: string) => void;
  onReroll: () => void;
  onContinue: () => void;
  onRestart: () => void;
  onTallyComplete: () => void;
  onCashOut: () => void;
  onDismissToast: (toastId: string) => void;
  onSellModifier: (modifierId: string) => void;
  /** Moves a modifier to slot `toIndex`, shifting the others. */
  onMoveModifier: (modifierId: string, toIndex: number) => void;
  onSortHand: (sort: HandSort) => void;
};
