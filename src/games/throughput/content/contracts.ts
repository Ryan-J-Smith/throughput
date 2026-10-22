import type { ContractDef } from '../model';

export const CONTRACTS: readonly ContractDef[] = [
  {
    id: 'tooling-upgrade',
    name: 'Tooling Upgrade',
    price: 3,
    effect: 'tooling',
    targetsCard: true,
    targetsCategory: false,
    text: 'Permanently improve one deck card: Design +$1, Make +3 Units, or a Boutique-style Ship +5 cap.',
  },
  { id: 'downsizing', name: 'Downsizing', price: 4, effect: 'downsize', targetsCard: true, targetsCategory: false, text: 'Remove one card from your deck.' },
  {
    id: 'rnd-grant',
    name: 'R&D Grant',
    price: 5,
    effect: 'grant',
    targetsCard: false,
    targetsCategory: true,
    text: 'Pick a Category. Scale: +10 Demand and +3 Units at its Ships. Premium: its sales +25% price.',
  },
  { id: 'floor-expansion', name: 'Floor Expansion', price: 10, effect: 'expand', targetsCard: false, targetsCategory: false, text: '+1 Line slot (max 7).' },
];
