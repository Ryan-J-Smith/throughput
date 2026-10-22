// PLACEHOLDER content so the shell is clickable before a design is chosen.
// Delete along with the rest of src/ui/placeholder/ once the engine drives the UI.

export type FixtureCard = {
  key: string;
  title: string;
  description: string;
  tags: readonly string[];
  cost: number;
  value: number;
};

export const HAND_FIXTURES: readonly FixtureCard[] = [
  { key: 'bulk-order', title: 'Bulk Order', description: 'Move volume at thin margins.', tags: ['Sales'], cost: 1, value: 12 },
  { key: 'flash-sale', title: 'Flash Sale', description: 'A quick burst of revenue.', tags: ['Sales', 'Marketing'], cost: 2, value: 18 },
  { key: 'supplier-deal', title: 'Supplier Deal', description: 'Cheaper inputs this quarter.', tags: ['Ops'], cost: 1, value: 8 },
  { key: 'ad-campaign', title: 'Ad Campaign', description: 'Reach new customers.', tags: ['Marketing'], cost: 3, value: 24 },
  { key: 'quality-check', title: 'Quality Check', description: 'Fewer returns, happier buyers.', tags: ['Ops', 'Product'], cost: 1, value: 6 },
  { key: 'rush-shipping', title: 'Rush Shipping', description: 'Fast delivery, premium price.', tags: ['Logistics'], cost: 2, value: 15 },
  { key: 'pop-up-store', title: 'Pop-up Store', description: 'Test a new market in person.', tags: ['Retail'], cost: 2, value: 20 },
  { key: 'loyalty-program', title: 'Loyalty Program', description: 'Repeat customers add up.', tags: ['Marketing', 'Retail'], cost: 3, value: 10 },
];

export type FixtureModifier = {
  key: string;
  title: string;
  description: string;
  tags: readonly string[];
  price: number;
};

export const MODIFIER_FIXTURES: readonly FixtureModifier[] = [
  { key: 'franchise', title: 'Franchise Model', description: 'Retail cards score extra.', tags: ['Retail'], price: 6 },
  { key: 'lean-ops', title: 'Lean Ops', description: 'Ops cards cost less.', tags: ['Ops'], price: 5 },
  { key: 'viral-brand', title: 'Viral Brand', description: 'Marketing cards score double.', tags: ['Marketing'], price: 8 },
  { key: 'warehouse', title: 'Warehouse', description: '+1 hand size.', tags: ['Logistics'], price: 7 },
  { key: 'sales-team', title: 'Sales Team', description: '+1 play per round.', tags: ['Sales'], price: 9 },
  { key: 'r-and-d', title: 'R&D Lab', description: 'Product cards gain value each round.', tags: ['Product'], price: 6 },
];
