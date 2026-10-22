export const CATEGORIES = ['Apparel', 'Gadgets', 'Home', 'Food'] as const;
export type Category = (typeof CATEGORIES)[number];

/** One-letter suffix used in card names ("Sketch-G"). */
export const CATEGORY_CODE: Readonly<Record<Category, string>> = { Apparel: 'A', Gadgets: 'G', Home: 'H', Food: 'F' };

export type Stage = 'design' | 'make' | 'ship';

/** Where a Category sits on the trend conveyor this quarter. */
export type TrendStage = 'emerging' | 'hot' | 'saturated' | 'neutral';

export type Rarity = 'common' | 'uncommon' | 'rare';

type CardDefBase = {
  readonly id: string;
  readonly name: string;
  /** Shop price in Capital; 0 for starter cards. */
  readonly price: number;
  readonly text: string;
};

/** Design: changes the Batch's Margin, then stays on the Line for the rest of the round. */
export type DesignDef = CardDefBase & {
  readonly stage: 'design';
  readonly marginAdd: number;
  readonly marginMul: number;
};

/** Make: adds Units to the Batch (and may nudge Margin). Dispatched after the Shift. */
export type MakeDef = CardDefBase & {
  readonly stage: 'make';
  readonly units: number;
  readonly marginAdd: number;
};

/**
 * Ship: sells Units at the Batch's Margin times `marginMul`. `cap` is how many: up to a number (and
 * the Category's Demand left), up to the Category's Demand left ('demand'), or every Unit, ignoring
 * Demand ('all').
 */
export type ShipDef = CardDefBase & {
  readonly stage: 'ship';
  readonly cap: number | 'demand' | 'all';
  readonly marginMul: number;
};

export type CardDef = DesignDef | MakeDef | ShipDef;

/** A card in the player's deck. Counters persist for the whole run. */
export type Card = {
  readonly uid: number;
  readonly def: CardDef;
  readonly category: Category;
  /** Capital paid in the shop (0 for starter cards); sells for half. */
  readonly paid: number;
  /** Tooling Upgrades applied: each is Design +$1, Make +3 Units or (numeric-cap) Ship +5 cap. */
  upgrades: number;
  /** R&D Lab growth: +$1 Margin per point when this Design resolves. */
  growth: number;
};

export type ContractEffect = 'tooling' | 'downsize' | 'expand' | 'grant' | 'clone' | 'campaign' | 'training' | 'bond';

/** What an R&D Grant buys for its Category: Scale (more Demand and Units) or Premium (a higher sale price). */
export type GrantOption = 'scale' | 'premium';

/** R&D Grant levels a Category has bought. */
export type GrantLevels = { readonly scale: number; readonly premium: number };

/** A one-off shop purchase that changes the deck or the floor. */
export type ContractDef = {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly text: string;
  readonly effect: ContractEffect;
  /** True when buying it needs a deck card to act on. */
  readonly targetsCard: boolean;
  /** True when buying it needs a Category and a Grant option (R&D Grant). */
  readonly targetsCategory: boolean;
  /** Shop weight relative to other Contracts (default 1). */
  readonly weight?: number;
};

/** Run-long bonuses bought with Contracts. */
export type Perks = { readonly hotPips: number; readonly retools: number; readonly interestCap: number };
