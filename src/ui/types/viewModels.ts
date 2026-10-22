// Display-only view models. The UI renders these and reports intent through callbacks;
// whatever owns game state (placeholder now, engine later) is responsible for producing them.

export type CardView = {
  id: string;
  title: string;
  description: string;
  tags: readonly string[];
  cost?: number;
  value?: number;
  disabled?: boolean;
};

export type ModifierView = {
  id: string;
  title: string;
  description: string;
  tags: readonly string[];
};

export type ShopOfferView = {
  id: string;
  card: CardView;
  price: number;
  canBuy: boolean;
  sold: boolean;
};

export type HudView = {
  round: number;
  targetScore: number;
  currentScore: number;
  playsLeft: number;
  discardsLeft: number;
  cash: number;
};

export type ModifierRowView = {
  modifiers: readonly ModifierView[];
  slots: number;
};

export type ShellView =
  | { screen: 'title' }
  | {
      screen: 'round';
      hud: HudView;
      modifierRow: ModifierRowView;
      hand: readonly CardView[];
      selectedIds: readonly string[];
      maxSelected: number;
      canPlay: boolean;
      canDiscard: boolean;
    }
  | {
      screen: 'shop';
      hud: HudView;
      modifierRow: ModifierRowView;
      offers: readonly ShopOfferView[];
      rerollCost: number;
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
};
