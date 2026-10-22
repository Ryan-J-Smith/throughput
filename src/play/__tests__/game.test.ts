import { describe, expect, it } from 'vitest';
import { demoRun } from '../../sim/demo';
import type { DemoCard } from '../../sim/demo';
import { GenericRenderer } from '../render';
import { PlayableGame, SaveError } from '../session';
import type { SaveFile } from '../session';
import type { StateView } from '../view';

const game = new PlayableGame<DemoCard>({ name: 'demo', createRun: demoRun, renderer: new GenericRenderer() });

/** A simple scripted player: play up to five cards, buy the first affordable offer, else continue. */
function autoAction(view: StateView): string {
  if (view.phase === 'playing') {
    const count = Math.min(5, view.hand.length);
    return `play ${Array.from({ length: count }, (_, i) => i + 1).join(' ')}`;
  }
  const buy = view.legalActions.find((a) => a.startsWith('buy '));
  return buy?.split(' — ')[0] ?? 'continue';
}

/** Plays a whole run through act(), returning every intermediate save and the final view. */
function playThrough(seed: number): { saves: SaveFile[]; last: StateView } {
  let save = game.newSave(seed);
  let view = game.view(save);
  const saves = [save];
  for (let i = 0; i < 500 && view.legalActions.length > 0; i++) {
    const result = game.act(save, autoAction(view));
    if (!result.ok) throw new Error(`scripted action refused: ${result.reason}`);
    save = result.save;
    view = result.view;
    saves.push(save);
  }
  return { saves, last: view };
}

describe('PlayableGame replay', () => {
  it('starts in roundStart with no actions', () => {
    const view = game.view(game.newSave(42));
    expect(view).toMatchObject({ game: 'demo', seed: 42, actionsTaken: 0, phase: 'roundStart', hand: [] });
    expect(view.legalActions).toEqual(['continue — start round 1 (target 120)']);
  });

  it('a full run replays to exactly the state the live session reached', () => {
    const { saves, last } = playThrough(7);
    expect(['won', 'lost']).toContain(last.phase);
    const final = saves.at(-1) as SaveFile;
    expect(game.view(final)).toEqual(last);
    expect(final.actions.some((a) => a.startsWith('buy '))).toBe(true);
  });

  it('every intermediate save replays deterministically', () => {
    const { saves } = playThrough(3);
    for (const save of saves) expect(game.view(save)).toEqual(game.view(save));
    expect(playThrough(3).saves).toEqual(saves);
  });

  it('different seeds deal different hands', () => {
    const hand = (seed: number) => {
      const result = game.act(game.newSave(seed), 'continue');
      return result.ok ? result.view.hand : [];
    };
    expect(hand(1)).not.toEqual(hand(2));
  });

  it('views are plain JSON', () => {
    const { last } = playThrough(11);
    expect(JSON.parse(JSON.stringify(last))).toEqual(last);
  });

  it('logs scoring steps and draws for a play', () => {
    const started = game.act(game.newSave(42), 'continue');
    if (!started.ok) throw new Error(started.reason);
    const played = game.act(started.save, 'discard 1');
    expect(played.ok && played.log[0]).toMatch(/^Discarded: .* \(2 discards left\)$/);
    expect(played.ok && played.log[1]).toMatch(/^Drew: /);
    if (!played.ok) return;
    const scored = game.act(played.save, 'play 1 2');
    expect(scored.ok && scored.log.slice(1, 4)).toEqual([
      '  2-card play: multiplier = 2 → 2',
      expect.stringMatching(/^ {2}card \d+: base \+\d+ → \d+$/),
      expect.stringMatching(/^ {2}card \d+: base \+\d+ → \d+$/),
    ]);
  });

  it('refuses illegal actions with the engine reason and leaves the save alone', () => {
    const save = game.newSave(42);
    const buy = game.act(save, 'buy 1');
    expect(buy).toMatchObject({ ok: false, reason: 'Shop is closed' });
    const play = game.act(save, 'play 1');
    expect(play).toMatchObject({ ok: false, reason: 'No card at hand position 1 (hand has 0)' });
    const junk = game.act(save, 'fly away');
    expect(junk.ok).toBe(false);
    expect(save.actions).toEqual([]);
  });

  it('previews the next round in the shop, matching the round after leaving', () => {
    let save = game.newSave(5);
    let view = game.view(save);
    while (view.phase !== 'shop') {
      const result = game.act(save, autoAction(view));
      if (!result.ok) throw new Error(result.reason);
      ({ save, view } = result);
    }
    const next = view.next;
    expect(next?.number).toBe(2);
    const left = game.act(save, 'continue');
    expect(left.ok && left.view.round).toMatchObject({ number: next?.number, target: next?.target, boss: next?.boss });
  });

  it('rejects saves for another game or logs that no longer replay', () => {
    expect(() => game.view({ ...game.newSave(1), game: 'other' })).toThrow(SaveError);
    expect(() => game.view({ ...game.newSave(1), actions: ['continue', 'buy 1'] })).toThrow(/Action 2 "buy 1" no longer replays: Shop is closed/);
  });
});
