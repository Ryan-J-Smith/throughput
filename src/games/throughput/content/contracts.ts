import type { ContractDef } from '../model';

export const CONTRACTS: readonly ContractDef[] = [
  {
    id: 'tooling-upgrade',
    name: 'Tooling Upgrade',
    price: 3,
    effect: 'tooling',
    targetsCard: true,
    text: 'Permanently improve one deck card: Design +$1, Make +3 Units, or Ship +5 cap.',
  },
  { id: 'downsizing', name: 'Downsizing', price: 4, effect: 'downsize', targetsCard: true, text: 'Remove one card from your deck.' },
  { id: 'floor-expansion', name: 'Floor Expansion', price: 10, effect: 'expand', targetsCard: false, text: '+1 Line slot (max 7).' },
];
