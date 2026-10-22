import { describe, expect, it } from 'vitest';
import type { SaveFile, TurnResult } from '../../../play/session';
import { ThroughputTextGame, formatAction, offerText, parseAction, rulesText } from '../cli';
import { DEFAULT_CONFIG, INFLUENCER, WHOLESALE_CLUB } from '../content';
import { ThroughputRun } from '../rules';
import { easyConfig } from './fixtures';

type HandEntry = { readonly n: number; readonly name: string; readonly stage: string };

/** The hand as --json lists it. */
function handOf(game: ThroughputTextGame, save: SaveFile): HandEntry[] {
  return (game.show(save).state as { hand: HandEntry[] }).hand;
}

/** The hand number of the first card of a type. */
function numberOf(hand: readonly HandEntry[], stage: string): number {
  const entry = hand.find((c) => c.stage === stage);
  if (entry === undefined) throw new Error(`no ${stage} in hand`);
  return entry.n;
}

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
    ['buy 5 Home Scale', 'buy 5 home scale'],
    ['buy 5 f premium', 'buy 5 food premium'],
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

  it.each(['load', 'load 3-1', 'load 0:1', 'retool', 'buy', 'buy x', 'buy 5 home', 'buy 5 toys scale', 'buy 5 home scale 2', 'sell 2', 'move 1', 'run now', 'dance'])('rejects "%s"', (text) => {
    expect(parseAction(text).ok).toBe(false);
  });
});

describe('ThroughputTextGame', () => {
  const game = new ThroughputTextGame(easyConfig());

  it('shows a new run with the Line, hand, preview, market and legal actions', () => {
    const view = game.show(game.newSave(1));
    expect(view.text).toContain('Y1 Q1 (round 1 of 3) · Shift 1 of 4');
    expect(view.text).toContain('Market (this round and the 3 after):');
    expect(view.text).toContain('Hand (7; a card keeps its number until it leaves the hand):');
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

  it('hand numbers stay put across commands; drawn cards say where they went', () => {
    const start = handOf(game, game.newSave(1));
    const [first, second] = start;
    if (first === undefined || second === undefined) throw new Error('short hand');
    const save = play(game, 1, [`load ${first.n}:1`]);
    const loaded = ok(game.take(save, `load ${second.n}:2`));
    expect(loaded.log).toEqual([`Loaded ${second.name} → slot 2.`]);
    expect(handOf(game, loaded.save).map((c) => c.n)).toEqual(start.slice(2).map((c) => c.n));
    expect(game.take(loaded.save, `load ${first.n}:3`)).toMatchObject({ ok: false, reason: `No hand card ${first.n}` });
    const retooled = ok(game.take(loaded.save, `retool ${start[2]?.n ?? 0}`));
    expect(retooled.log[0]).toMatch(new RegExp(`; drew \\S+ \\(${start[2]?.n ?? 0}\\)\\.$`));
    const ran = ok(game.take(loaded.save, 'run'));
    expect(ran.log).toContain(`Drew ${handOf(game, ran.save).slice(0, 2).map((c) => `${c.name} (${c.n})`).join(', ')}.`);
  });

  it('the preview says when a Shift clears and what overkill it pays', () => {
    const hand = handOf(game, game.newSave(1));
    const save = play(game, 1, [`load ${numberOf(hand, 'make')}:1 ${numberOf(hand, 'ship')}:2`]);
    const run = new ThroughputRun(1, easyConfig());
    const view = game.show(save);
    // Target $10; one Make and one Ship make $12: 20% over, under the first 25% step.
    expect(view.text).toContain('  This Shift clears the target.');
    expect(view.legalActions).toContain(`run — run Shift 1 of 4 (makes $12; round reaches $12 of $${run.target}; clears the target)`);
    const big = new ThroughputTextGame(easyConfig({ targets: [5, 10, 10] }));
    expect(big.show(play(big, 1, [`load ${numberOf(hand, 'make')}:1 ${numberOf(hand, 'ship')}:2`])).text).toContain('  This Shift clears the target, +5C overkill (140% over).');
  });

  it('marks what stays on the Line after the run', () => {
    const hand = handOf(game, game.newSave(1));
    const view = game.show(play(game, 1, [`load ${numberOf(hand, 'design')}:1 ${numberOf(hand, 'make')}:2`])).text;
    expect(view).toMatch(/1\. no Fixture \| Sketch-\w · .* \[loaded this Shift; stays after the run\]/);
    expect(view).toMatch(/2\. no Fixture \| Workshop-\w · .* \[loaded this Shift; dispatched after the run\]/);
  });

  it('Line Shift: the shop shows the Shift 1 and Shift 2 layouts, the log and state list each move, and parked cards can be unloaded', () => {
    const config = easyConfig({ roundsPerYear: 2, targets: [10, 10_000, 10, 10], startingCapital: 100 });
    const shiftGame = new ThroughputTextGame(config);
    const toShop = (seed: number) => {
      const hand = handOf(shiftGame, shiftGame.newSave(seed));
      return play(shiftGame, seed, [`load ${numberOf(hand, 'make')}:1 ${numberOf(hand, 'ship')}:2`, 'run', 'buy 1 1']);
    };
    // First seed whose Board is Line Shift and whose Line Shift opening hand holds a Design.
    let seed = 1;
    const fits = (s: number) =>
      new ThroughputRun(s, config).boardBosses[0]?.id === 'line-shift' && handOf(shiftGame, ok(shiftGame.take(toShop(s), 'continue')).save).some((c) => c.stage === 'design');
    while (!fits(seed)) seed++;
    const shop = toShop(seed);
    const name = (shiftGame.show(shop).state as { line: { fixture: { name: string } | null }[] }).line[0]?.fixture?.name ?? '';
    expect(shiftGame.show(shop).text).toContain(
      `Line Shift next round: Shift 1 runs on 1. ${name} · 2. - · 3. - · 4. - · 5. -; before Shift 2 they move to 1. - · 2. ${name} · 3. - · 4. - · 5. -.`,
    );
    const next = ok(shiftGame.take(shop, 'continue'));
    expect(next.log).toEqual([expect.stringMatching(/ begins: target \$10000\.$/)]);
    const shift1 = handOf(shiftGame, next.save);
    const loaded = ok(shiftGame.take(next.save, `load ${numberOf(shift1, 'make')}:3`));
    const ran = ok(shiftGame.take(loaded.save, 'run'));
    expect(ran.log).toContain(`Line Shift: Fixtures moved before Shift 2: ${name} 1→2.`);
    expect(ran.view.text).toContain(`Line Shift moved your Fixtures before this Shift: ${name} 1→2.`);
    expect(ran.view.state).toMatchObject({ fixtureMoves: [{ fixture: name, from: 1, to: 2 }] });
    // A Design parked in Shift 1 can come back to hand in a Line Shift round.
    const design = shift1.find((c) => c.stage === 'design');
    if (design === undefined) throw new Error('no Design in the Line Shift opening hand');
    const parked = ok(shiftGame.take(ok(shiftGame.take(next.save, `load ${design.n}:4`)).save, 'run'));
    expect(parked.view.text).toContain('[parked since Shift 1; stays after the run; Line Shift lets you unload it]');
    expect(parked.view.legalActions).toContain('unload <slot> … — take back cards loaded this Shift, or parked ones (Line Shift) (slots 4)');
    expect(ok(shiftGame.take(parked.save, 'unload 4')).log).toEqual([`Back in hand: ${design.name}.`]);
  });

  it('plays from a Shift into the shop and on into round 2', () => {
    const hand = handOf(game, game.newSave(1));
    const make = numberOf(hand, 'make');
    const ship = numberOf(hand, 'ship');
    const shop = ok(game.take(play(game, 1, [`load ${make}:1 ${ship}:2`]), 'run'));
    expect(shop.log.at(-1)).toMatch(/^Target hit! Y1 Q1 cleared\. Payout: Q1 cleared 4C, 3 unused Shifts 6C\.$/);
    expect(shop.view.text).toContain('Shop (reroll 2C):');
    expect(shop.view.text).toMatch(/Interest: holding \d+C when the next round clears pays \+\d+C/);
    expect(shop.view.legalActions.at(-3)).toBe('continue — start Y1 Q2 (round 2, target $10)');
    const next = ok(game.take(shop.save, 'continue'));
    expect(next.view.state).toMatchObject({ phase: 'shift', round: 2 });
  });

  it('buys an R&D Grant for a Category with Scale or Premium, and replays it', () => {
    const toShop = (seed: number) => {
      const hand = handOf(game, game.newSave(seed));
      return ok(game.take(play(game, seed, [`load ${numberOf(hand, 'make')}:1 ${numberOf(hand, 'ship')}:2`]), 'run')).save;
    };
    const grantOffer = (save: SaveFile) => (game.show(save).state as { shop: { offers: ({ text: string } | null)[] } }).shop.offers.findIndex((o) => o?.text.startsWith('Contract · R&D Grant') === true);
    const seed = Array.from({ length: 200 }, (_, i) => i + 1).find((s) => grantOffer(toShop(s)) >= 0);
    if (seed === undefined) throw new Error('no seed offers an R&D Grant after round 1');
    const shop = toShop(seed);
    const n = grantOffer(shop) + 1;
    expect(game.show(shop).legalActions).toContain(
      `buy ${n} <category> scale|premium — R&D Grant for 5C: Scale gives that Category +10 Demand and +3 Units at its Ships; Premium +25% on its sale price`,
    );
    expect(game.take(shop, `buy ${n}`)).toMatchObject({ ok: false, reason: `Say which Category and scale or premium (buy ${n} <category> scale|premium)` });
    expect(game.take(shop, `buy ${n} 2`)).toMatchObject({ ok: false, reason: `R&D Grant needs a Category and scale or premium, e.g. "buy ${n} home scale"` });
    const bought = ok(game.take(shop, `buy ${n} H scale`));
    expect(bought.log[0]).toMatch(/^Bought R&D Grant for 5C: Home Scale 1\. Capital \d+C\.$/);
    expect(bought.save.actions.at(-1)).toBe(`buy ${n} home scale`);
    expect((game.show(bought.save).state as { demand: Record<string, unknown> }).demand.Home).toMatchObject({ scale: 1, premium: 0 });
  });
});

describe('rules and shop text', () => {
  it('the rules match the engine on Hot pips and explain how a sale is priced, with numbers from the config', () => {
    const text = rulesText(DEFAULT_CONFIG);
    expect(text).toContain('A Shift in which a Hot Ship card sells at least\n    1 Unit spends 1 pip');
    expect(text).not.toContain('first 2 Shifts');
    expect(text).toContain('HOW A SALE IS PRICED');
    expect(text).toContain('Revenue is rounded down once per sale');
    expect(text).toContain('Line Shift: Shift 1 runs on your layout. From Shift 2 on');
    expect(text).toContain('The opening hand always holds at least one Make and one Ship');
    expect(text).toContain('Restock: Once per round, when you would draw from an empty draw pile');
    expect(rulesText({ ...DEFAULT_CONFIG, restocksPerRound: 0, openingHandTypes: [] })).toContain('The deck does NOT reshuffle during a round');
    expect(text).toContain(`Targets: Y1 ${DEFAULT_CONFIG.targets.slice(0, 3).join('/')}`);
    expect(rulesText({ ...DEFAULT_CONFIG, handSize: 8 })).toContain('a hand of 8');
    expect(text).toContain(`each full ${DEFAULT_CONFIG.overkill.step * 100}% of the target you sold beyond it pays +1C`);
  });

  it('a shop card offer names its Category and type, in the same words the deck uses', () => {
    expect(offerText({ kind: 'card', def: INFLUENCER, category: 'Food', price: 5 })).toBe('Card · Influencer-F (Food Design) · 5C: Margin ×1.5');
    expect(offerText({ kind: 'card', def: WHOLESALE_CLUB, category: 'Home', price: 4 })).toBe(
      'Card · Wholesale Club-H (Home Ship) · 4C: sell all Units at half Margin (ignores Demand and cap cuts)',
    );
  });
});
