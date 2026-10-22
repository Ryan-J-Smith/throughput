import type { HandSort } from '../ui/types';
import type { SortKeys } from './ContentPresenter';

function compareGroup(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a.localeCompare(b);
}

/**
 * Display order for a hand. Returns a new array and never touches the input, so the engine's
 * own hand order is unaffected. Ties keep their dealt order.
 */
export function sortHand<T>(cards: readonly T[], sort: HandSort, keysOf: (card: T) => SortKeys): T[] {
  if (sort === 'dealt') return [...cards];
  const keyed = cards.map((card) => ({ card, keys: keysOf(card) }));
  keyed.sort((a, b) => {
    const byValue = b.keys.value - a.keys.value;
    if (sort === 'value') return byValue;
    return compareGroup(a.keys.group, b.keys.group) || byValue;
  });
  return keyed.map((k) => k.card);
}
