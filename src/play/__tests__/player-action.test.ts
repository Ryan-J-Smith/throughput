import { describe, expect, it } from 'vitest';
import { formatAction, parseAction } from '../actions';
import type { PlayerAction } from '../actions';

describe('parseAction', () => {
  it.each<[string, PlayerAction]>([
    ['play 1 3 4', { kind: 'play', positions: [1, 3, 4] }],
    ['  DISCARD   2 5 ', { kind: 'discard', positions: [2, 5] }],
    ['buy 2', { kind: 'buy', slot: 2 }],
    ['sell 1', { kind: 'sell', position: 1 }],
    ['reroll', { kind: 'reroll' }],
    ['continue', { kind: 'continue' }],
  ])('parses "%s"', (text, action) => {
    expect(parseAction(text)).toEqual({ ok: true, action });
  });

  it.each([
    ['', /Unknown action/],
    ['dance', /Unknown action "dance"/],
    ['play', /needs at least one hand position/],
    ['play 1 1', /listed once/],
    ['play 0', /whole numbers starting at 1/],
    ['discard 1.5', /whole numbers/],
    ['buy', /exactly one number/],
    ['sell 1 2', /exactly one number/],
    ['reroll 3', /takes no arguments/],
  ])('rejects "%s"', (text, reason) => {
    const result = parseAction(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  it('formatAction round-trips to the canonical text', () => {
    for (const text of ['play 1 3 4', 'discard 2', 'buy 2', 'sell 1', 'reroll', 'continue']) {
      const parsed = parseAction(text);
      expect(parsed.ok && formatAction(parsed.action)).toBe(text);
    }
    const messy = parseAction('  PLAY  5   2 ');
    expect(messy.ok && formatAction(messy.action)).toBe('play 5 2');
  });
});
