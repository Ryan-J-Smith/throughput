import { describe, expect, it } from 'vitest';
import { SaveError } from '../session';
import type { SaveFile } from '../session';
import { CounterGame } from './counter-game';

describe('ReplayTextGame', () => {
  const game = new CounterGame();

  it('records canonical actions and replays them', () => {
    const first = game.take(game.newSave(5), '  add   3 ');
    if (!first.ok) throw new Error(first.reason);
    expect(first.save.actions).toEqual(['add 3']);
    expect(first.view.text).toBe('value 8 after 1 actions');
    expect(game.show(first.save)).toEqual(first.view);
  });

  it('does not record read-only queries', () => {
    const save = game.newSave(1);
    const peek = game.take(save, 'peek');
    expect(peek).toMatchObject({ ok: true, log: ['value is 1'] });
    expect(peek.ok && peek.save).toBe(save);
  });

  it('refuses without touching the save', () => {
    const save: SaveFile = { ...game.newSave(90), actions: ['add 5'] };
    const result = game.take(save, 'add 10');
    expect(result).toMatchObject({ ok: false, reason: 'would exceed 100' });
    expect(result.view.state).toEqual({ value: 95 });
  });

  it('rejects saves for other games and logs that no longer replay', () => {
    expect(() => game.show({ ...game.newSave(1), game: 'other' })).toThrow(SaveError);
    expect(() => game.show({ ...game.newSave(99), actions: ['add 5'] })).toThrow(/Action 1 "add 5" no longer replays: would exceed 100/);
  });
});
