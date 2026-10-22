import { describe, expect, it } from 'vitest';
import { sortHand } from '../handSort';

type C = { name: string; value: number; group: number | string };
const keys = (c: C) => ({ value: c.value, group: c.group });

const hand: C[] = [
  { name: 'a', value: 3, group: 'spades' },
  { name: 'b', value: 9, group: 'hearts' },
  { name: 'c', value: 3, group: 'hearts' },
  { name: 'd', value: 7, group: 2 },
  { name: 'e', value: 9, group: 'spades' },
];

const names = (cards: C[]) => cards.map((c) => c.name).join('');

describe('sortHand', () => {
  it('dealt keeps the original order in a copy', () => {
    const out = sortHand(hand, 'dealt', keys);
    expect(names(out)).toBe('abcde');
    expect(out).not.toBe(hand);
  });

  it('value sorts high to low, ties keeping dealt order', () => {
    expect(names(sortHand(hand, 'value', keys))).toBe('bedac');
  });

  it('group sorts numbers first, then strings alphabetically, value descending within a group', () => {
    expect(names(sortHand(hand, 'group', keys))).toBe('dbcea');
  });

  it('never mutates the input', () => {
    sortHand(hand, 'value', keys);
    expect(names(hand)).toBe('abcde');
  });
});
