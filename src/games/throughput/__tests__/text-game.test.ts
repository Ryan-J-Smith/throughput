import { describe, expect, it } from 'vitest';
import type { SaveFile, TurnResult } from '../../../play/session';
import { ThroughputTextGame, formatAction, parseAction } from '../cli';
import { easyConfig } from './fixtures';

function ok(result: TurnResult): Extract<TurnResult, { ok: true }> {
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result;
}

/** Plays `actions` from a new save, failing on any refusal. */
function play(game: ThroughputTextGame, seed: number, actions: readonly string[]): SaveFile {
  return actions.reduce((save, text) => ok(game.take(save, text)).save, game.newSave(seed));
}

describe('parseAction / formatAction', () => {
  it.each([
    ['load 3:1 5:4', 'load 3:1 5:4'],
    ['  LOAD   3:1  ', 'load 3:1'],
    ['unload 2 3', 'unload 2 3'],
    ['scrap 1', 'scrap 1'],
    ['retool 1 4 6', 'retool 1 4 6'],
    ['buy 2', 'buy 2'],
    ['buy 1 3', 'buy 1 3'],
    ['sell fixture 2', 'sell fixture 2'],
    ['sell card 21', 'sell card 21'],
    ['move 1 4', 'move 1 4'],
    ['run', 'run'],
    ['continue', 'continue'],
  ])('%s → %s', (text, canonical) => {
    const parsed = parseAction(text);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(formatAction(parsed.action)).toBe(canonical);
  });

  it.each(['load', 'load 3-1', 'load 0:1', 'retool', 'buy', 'buy x', 'sell 2', 'move 1', 'run now', 'dance'])('rejects "%s"', (text) => {
    expect(parseAction(text).ok).toBe(false);
  });
});

describe('ThroughputTextGame', () => {
  const game = new ThroughputTextGame(easyConfig());

  it('shows a new run with the Line, hand, preview, market and legal actions', () => {
    const view = game.show(game.newSave(1));
    expect(view.text).toContain('Y1 Q1 (round 1 of 3) · Shift 1 of 4');
    expect(view.text).toContain('Market (this round and the 3 after):');
    expect(view.text).toContain('Hand (7):');
    expect(view.text).toContain('If you run now:');
    expect(view.legalActions[0]).toMatch(/^load <hand>:<slot>/);
    expect(view.legalActions).toContain('rules — show the full rules (free)');
    expect(view.state).toMatchObject({ game: 'throughput', phase: 'shift', round: 1, capital: 4 });
  });

  it('records canonical actions, refuses illegal ones without touching the save, and replays exactly', () => {
    const save = play(game, 1, ['LOAD 1:1']);
    expect(save.actions).toEqual(['load 1:1']);
    const refused = game.take(save, 'load 2:1');
    expect(refused).toMatchObject({ ok: false, reason: expect.stringMatching(/already holds/) });
    const ran = ok(game.take(save, 'run'));
    expect(ran.log[0]).toBe('Shift 1:');
    expect(game.show(ran.save).text).toBe(ran.view.text);
  });

  it('rules and deck are free queries that leave the save alone', () => {
    const save = game.newSave(1);
    for (const query of ['rules', 'deck']) {
      const result = ok(game.take(save, query));
      expect(result.save).toBe(save);
      expect(result.log.join('\n').length).toBeGreaterThan(0);
    }
  });

  it('plays from a Shift into the shop and on into round 2', () => {
    const view = game.show(game.newSave(1));
    const state = view.state as { hand: { stage: string }[] };
    const make = state.hand.findIndex((c) => c.stage === 'make') + 1;
    const ship = state.hand.findIndex((c) => c.stage === 'ship') + 1;
    const shop = ok(game.take(play(game, 1, [`load ${make}:1 ${ship}:2`]), 'run'));
    expect(shop.log.at(-1)).toMatch(/^Target hit! Y1 Q1 cleared\. Payout: Q1 cleared 4C, 3 unused Shifts 6C\.$/);
    expect(shop.view.text).toContain('Shop (reroll 2C):');
    expect(shop.view.legalActions.at(-3)).toBe('continue — start Y1 Q2 (round 2, target $10)');
    const next = ok(game.take(shop.save, 'continue'));
    expect(next.view.state).toMatchObject({ phase: 'shift', round: 2 });
  });
});
