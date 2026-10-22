// PLACEHOLDER content so the shell is clickable before a design is chosen.
// Delete along with the rest of src/ui/placeholder/ once the engine drives the UI.

import type { Rarity } from '../types';

export type FixtureCard = {
  key: string;
  title: string;
  description: string;
  details: string;
  tags: readonly string[];
  cost: number;
  value: number;
};

export const HAND_FIXTURES: readonly FixtureCard[] = [
  { key: 'bulk-order', title: 'Bulk Order', description: 'Move volume at thin margins.', details: 'A large customer order. High base value, but it eats into inventory.', tags: ['Sales'], cost: 1, value: 12 },
  { key: 'flash-sale', title: 'Flash Sale', description: 'A quick burst of revenue.', details: 'Discount everything for a day. Strong now, weaker if repeated.', tags: ['Sales', 'Marketing'], cost: 2, value: 18 },
  { key: 'supplier-deal', title: 'Supplier Deal', description: 'Cheaper inputs this quarter.', details: 'Negotiate better terms with a supplier. Low value on its own.', tags: ['Ops'], cost: 1, value: 8 },
  { key: 'ad-campaign', title: 'Ad Campaign', description: 'Reach new customers.', details: 'A broad paid campaign. Expensive, but the biggest single swing.', tags: ['Marketing'], cost: 3, value: 24 },
  { key: 'quality-check', title: 'Quality Check', description: 'Fewer returns, happier buyers.', details: 'Tighten QA. Small value, pairs well with Product modifiers.', tags: ['Ops', 'Product'], cost: 1, value: 6 },
  { key: 'rush-shipping', title: 'Rush Shipping', description: 'Fast delivery, premium price.', details: 'Expedite orders for customers who will pay for speed.', tags: ['Logistics'], cost: 2, value: 15 },
  { key: 'pop-up-store', title: 'Pop-up Store', description: 'Test a new market in person.', details: 'A short-lease storefront. Good value with Retail modifiers.', tags: ['Retail'], cost: 2, value: 20 },
  { key: 'loyalty-program', title: 'Loyalty Program', description: 'Repeat customers add up.', details: 'Reward returning customers. Modest value that compounds.', tags: ['Marketing', 'Retail'], cost: 3, value: 10 },
];

export type FixtureModifier = {
  key: string;
  title: string;
  description: string;
  details: string;
  tags: readonly string[];
  price: number;
  rarity: Rarity;
};

export const MODIFIER_FIXTURES: readonly FixtureModifier[] = [
  { key: 'franchise', title: 'Franchise Model', description: 'Retail cards score extra.', details: 'Each Retail card played adds to the base before multipliers.', tags: ['Retail'], price: 6, rarity: 'common' },
  { key: 'lean-ops', title: 'Lean Ops', description: 'Ops cards cost less.', details: 'Ops cards cost 1 less to play, to a minimum of 0.', tags: ['Ops'], price: 5, rarity: 'common' },
  { key: 'viral-brand', title: 'Viral Brand', description: 'Marketing cards score double.', details: 'Multiplies the whole play when any Marketing card is included.', tags: ['Marketing'], price: 8, rarity: 'rare' },
  { key: 'warehouse', title: 'Warehouse', description: '+1 hand size.', details: 'Hold one more card in hand each round.', tags: ['Logistics'], price: 7, rarity: 'uncommon' },
  { key: 'sales-team', title: 'Sales Team', description: '+1 play per round.', details: 'Gain an extra play every round.', tags: ['Sales'], price: 9, rarity: 'legendary' },
  { key: 'r-and-d', title: 'R&D Lab', description: 'Product cards gain value each round.', details: 'Every Product card permanently gains value at the end of each round.', tags: ['Product'], price: 6, rarity: 'uncommon' },
];

export const GLOSSARY: Readonly<Record<string, string>> = {
  Sales: 'Direct revenue: converts effort into score now.',
  Marketing: 'Demand generation: tends to multiply rather than add.',
  Ops: 'Operations: cheap, efficient, low raw value.',
  Product: 'Improves what you sell; scales over a run.',
  Logistics: 'Moving goods: speed and capacity effects.',
  Retail: 'Physical storefronts and in-person sales.',
};
