import { describe, expect, it } from 'vitest';
import type { SaveFile, TurnResult } from '../../../play/session';
import { ThroughputTextGame, cardText, demandNote, fixtureNow, fixtureText, formatAction, formatView, interestTrade, legalActions, noShipNote, offerBlocker, overkillNote, offerText, parseAction, perksText, rulesText, shipsToDraw, traceLines } from '../cli';
import { BOSSES, CONTRACTS, DEFAULT_CONFIG, EXPORT_DEAL, INFLUENCER, TRUCK, WORKSHOP } from '../content';
import { CATEGORIES } from '../model';
import type { Card, Category, Perks } from '../model';
import { ThroughputRun, scoreLine } from '../rules';
import { boss, card, context, easyConfig, fixture, quotaCapRun, shopWithFixture, slot } from './fixtures';

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
    expect(big.show(play(big, 1, [`load ${numberOf(hand, 'make')}:1 ${numberOf(hand, 'ship')}:2`])).text).toContain(`  This Shift clears the target, +${DEFAULT_CONFIG.overkill.cap}C overkill (sold 2.4× the target).`);
    // The multiple rounds down: $323 of $130 is 2.4846×.
    expect(overkillNote(new ThroughputRun(1, easyConfig({ targets: [130, 130, 130] })), 323)).toBe('clears the target, +3C overkill (sold 2.48× the target)');
  });

  it('marks what stays on the Line for later Shifts and what this Shift uses up', () => {
    const hand = handOf(game, game.newSave(1));
    const view = game.show(play(game, 1, [`load ${numberOf(hand, 'design')}:1 ${numberOf(hand, 'make')}:2`])).text;
    expect(view).toMatch(/1\. no Fixture \| Sketch-\w · .* \[loaded this Shift; stays for later Shifts\]/);
    expect(view).toMatch(/2\. no Fixture \| Workshop-\w · .* \[loaded this Shift; used up this Shift\]/);
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
    expect(parked.view.text).toContain('[parked since Shift 1; stays for later Shifts; Line Shift lets you unload it]');
    expect(parked.view.legalActions).toContain('unload <slot> … — take back cards loaded this Shift, or parked ones (Line Shift) (slots 4)');
    expect(ok(shiftGame.take(parked.save, 'unload 4')).log).toEqual([`Back in hand: ${design.name}.`]);
  });

  it('the shop says when Capital past the interest ceiling earns nothing', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [0, 0, 0] }));
    run.runShift();
    const view = () => formatView(run, { game: 'throughput', seed: 1, actionsTaken: 1 });
    run.wallet.spend(run.wallet.cash);
    run.wallet.earn(24);
    expect(view()).toContain('Interest: holding 24C when the next round clears pays +4C (1C per full 5C, at most +5C).\n');
    run.wallet.earn(1);
    expect(view()).toContain('pays +5C (1C per full 5C, at most +5C). Capital above 25C earns nothing.\n');
  });

  it('a spend shows one interest figure, saying how much less when it lowers the interest', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 13 }));
    expect(interestTrade(run, 2)).toBe('then holding 11C → +2C interest');
    expect(interestTrade(run, 4)).toBe('then holding 9C → +1C interest, 1C less');
  });

  it('plays from a Shift into the shop and on into round 2', () => {
    const hand = handOf(game, game.newSave(1));
    const make = numberOf(hand, 'make');
    const ship = numberOf(hand, 'ship');
    const shop = ok(game.take(play(game, 1, [`load ${make}:1 ${ship}:2`]), 'run'));
    expect(shop.log.at(-1)).toMatch(/^Target hit! Y1 Q1 cleared\. Payout: Q1 cleared 4C, 3 unused Shifts 6C\.$/);
    expect(shop.view.text).toMatch(/Shop \(reroll 2C; holding \d+C → \+\d+C interest\):/);
    expect(shop.view.text).toMatch(/reroll — new offers for 2C \(then holding \d+C → \+\d+C interest(, \dC less)?\)/);
    expect(shop.view.text).toMatch(/Interest: holding \d+C when the next round clears pays \+\d+C/);
    expect(shop.view.legalActions.at(-3)).toBe('continue — start Y1 Q2 (round 2, target $10)');
    expect(ok(game.take(shop.save, 'reroll')).log).toEqual([expect.stringMatching(/^Rerolled for 2C \(Capital (\d+)C → \d+C\)\. Next reroll 3C\.$/)]);
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
      `buy ${n} <category> scale|premium — R&D Grant for 5C: Scale gives that Category's Demand +10 for good, and each of its Ship cards adds +3 Units to the Batch just before it sells; Premium: its sales +25% price`,
    );
    expect(game.take(shop, `buy ${n}`)).toMatchObject({ ok: false, reason: `Say which Category and scale or premium (buy ${n} <category> scale|premium)` });
    expect(game.take(shop, `buy ${n} 2`)).toMatchObject({ ok: false, reason: `R&D Grant needs a Category and scale or premium, e.g. "buy ${n} home scale"` });
    const bought = ok(game.take(shop, `buy ${n} H scale`));
    expect(bought.log[0]).toMatch(/^Bought R&D Grant for 5C: Home Scale 1\. Capital \d+C\.$/);
    expect(bought.save.actions.at(-1)).toBe(`buy ${n} home scale`);
    expect((game.show(bought.save).state as { demand: Record<string, unknown> }).demand.Home).toMatchObject({ scale: 1, premium: 0 });
  });
});

describe('Demand text', () => {
  it('lists Demand left (halved when Saturated), what running now would use, and next round\'s Demand in the shop', () => {
    const game = new ThroughputTextGame(easyConfig());
    const seed = Array.from({ length: 100 }, (_, i) => i + 1).find((s) => CATEGORIES.some((c) => new ThroughputRun(s, easyConfig()).trendsNow[c] === 'saturated'));
    if (seed === undefined) throw new Error('no seed with a Saturated Category in round 1');
    const run = new ThroughputRun(seed, easyConfig());
    const saturated = CATEGORIES.find((c) => run.trendsNow[c] === 'saturated') as string;
    const full = Math.floor(run.config.demand.start * run.config.demand.saturatedMul);
    const start = game.newSave(seed);
    expect(game.show(start).text).toContain(`${saturated} ${full} of ${full} (Saturated: halved)`);

    const hand = handOf(game, start);
    const ship = hand.find((c) => c.stage === 'ship') as HandEntry & { category: string };
    const loaded = play(game, seed, [`load ${numberOf(hand, 'make')}:1 ${ship.n}:2`]);
    expect(game.show(loaded).text).toMatch(new RegExp(`Demand used: ${ship.category} \\d+`));
    const shop = ok(game.take(loaded, 'run'));
    expect(shop.log.join('\n')).toMatch(new RegExp(`Demand used: ${ship.category} \\d+`));
    expect(shop.view.text).toMatch(/Demand next round: Apparel \d+/);
  });
});

/** A run with Contract perks already bought. */
/** A run whose `soldOut` Category has no Demand left this round. */
/** A run whose Restock this round is already used, on 9 cards. */
class RestockedRun extends ThroughputRun {
  override get restocksLeft(): number {
    return 0;
  }

  override get restocked(): number {
    return 9;
  }
}

class SoldOutRun extends ThroughputRun {
  private readonly soldOut: Category;

  constructor(soldOut: Category) {
    super(1);
    this.soldOut = soldOut;
  }

  override get demandLeft(): Record<Category, number> {
    return { ...super.demandLeft, [this.soldOut]: 0 };
  }
}

describe('playtest-2 clarity', () => {
  it('the header says Retools are per round, and retool says how many it could take', () => {
    const game = new ThroughputTextGame();
    expect(ok(game.take(game.newSave(1), 'deck')).view.text).toContain('Retools left this round 2');
    const run = new ThroughputRun(1);
    run.load([0, 1, 2, 3, 4].map((i) => ({ hand: i, slot: i })));
    expect(run.hand).toHaveLength(2);
    expect(legalActions(run)).toContain('retool <hand> … — discard 1–2 hand cards (up to 3; you hold 2) and draw as many into their places (2 left this round)');
  });

  it('the Shift header says when the Restock is used and what that means', () => {
    const view = (run: ThroughputRun) => formatView(run, { game: 'throughput', seed: 1, actionsTaken: 0 });
    expect(view(new ThroughputRun(1))).toContain(' · Restock ready');
    expect(view(new RestockedRun(1))).toContain(' · Restock used (9 cards): an empty draw pile stays empty this round');
  });

  it('a bought shop offer says what refills it', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [0, 0, 0], startingCapital: 100 }));
    run.runShift();
    const offer = run.offers.findIndex((o) => o?.kind === 'card');
    run.buy(offer);
    expect(formatView(run, { game: 'throughput', seed: 1, actionsTaken: 2 })).toContain(`  ${offer + 1}. (bought; a reroll or the next shop refills it)`);
  });

  it("gives each Ship card its Category's Demand left, and flags one that has sold out", () => {
    const run = new SoldOutRun('Gadgets');
    const ship = run.hand.find((c) => c.def.stage === 'ship');
    if (ship === undefined) throw new Error('no Ship in the opening hand');
    const other = CATEGORIES.find((c) => c !== ship.category) as Category;
    expect(demandNote(new SoldOutRun(ship.category), ship)).toBe(` (${ship.category} sold out: sells 0)`);
    const open = new SoldOutRun(other);
    expect(demandNote(open, ship)).toBe(` (${ship.category} ${open.demandLeft[ship.category]} left)`);
    expect(formatView(open, { game: 'throughput', seed: 1, actionsTaken: 0 })).toContain(`${cardText(ship)} (${ship.category} ${open.demandLeft[ship.category]} left)`);
    expect(demandNote(new SoldOutRun(ship.category), { ...ship, def: EXPORT_DEAL })).toBe('');
    expect(demandNote(open, run.hand.find((c) => c.def.stage !== 'ship') as Card)).toBe('');
  });
});

describe('brick hands', () => {
  it('the header counts the Ships left to draw', () => {
    const run = new ThroughputRun(1);
    const ships = run.drawPile.filter((c) => c.def.stage === 'ship').length;
    expect(shipsToDraw(run)).toBe(ships);
    expect(formatView(run, { game: 'throughput', seed: 1, actionsTaken: 0 })).toContain(`Draw pile ${run.drawPile.length} (${ships} Ship${ships === 1 ? '' : 's'}) · Discard pile 0`);
  });

  it('with cards but no Ship on the Line, the preview says what the Shift still earns', () => {
    const run = new ThroughputRun(1, easyConfig());
    const note = 'No Ship on the Line, so nothing sells: each Unit left at the end of the Shift clears for $1.';
    // An empty Line at the start of a Shift needs no warning.
    expect(noShipNote(run)).toBeNull();
    run.load([{ hand: run.hand.findIndex((c) => c.def.stage === 'make'), slot: 0 }]);
    expect(noShipNote(run)).toBe(note);
    expect(formatView(run, { game: 'throughput', seed: 1, actionsTaken: 1 })).toContain(`Shift total $${run.preview().total}.\n  ${note}`);
    run.load([{ hand: run.hand.findIndex((c) => c.def.stage === 'ship'), slot: 1 }]);
    expect(noShipNote(run)).toBeNull();
  });

  it('under JIT Auditor the note says leftover Units cost money', () => {
    const config = easyConfig({ roundsPerYear: 1, targets: [10_000] });
    const seed = Array.from({ length: 400 }, (_, i) => i + 1).find((x) => new ThroughputRun(x, config).boardBosses[0]?.id === 'jit-auditor');
    if (seed === undefined) throw new Error('no seed with JIT Auditor first');
    const run = new ThroughputRun(seed, config);
    run.load([{ hand: run.hand.findIndex((c) => c.def.stage !== 'ship'), slot: 0 }]);
    expect(noShipNote(run)).toBe('No Ship on the Line, so nothing sells, and under JIT Auditor each Unit left at the end costs $2.');
  });
});

describe('Fixture replace text', () => {
  it('lists a buy over a Fixture with its refund, which counts toward the price', () => {
    const run = shopWithFixture();
    const old = run.line[0]?.fixture?.def.name ?? '';
    const offer = run.offers[1];
    const refund = run.fixtureRefund(0);
    if (offer?.kind !== 'fixture') throw new Error('no Fixture offer');
    expect(refund).toBeGreaterThan(0);
    const over = `buy 2 <slot> — ${offer.def.name} for ${offer.price}C over a Fixture, which is sold for half as part of the buy (slot 1 ${old} +${refund}C)`;
    expect(legalActions(run)).toContain(over);

    run.wallet.spend(run.wallet.cash - (offer.price - refund));
    expect(offerBlocker(run, 1)).toBeNull();
    expect(legalActions(run)).toContain(over);
    expect(legalActions(run).some((a) => a.startsWith('buy 2 <slot>') && a.includes('without a Fixture'))).toBe(false);

    run.wallet.spend(1);
    expect(offerBlocker(run, 1)).toBe(`needs ${offer.price}C (you have ${run.wallet.cash}C, +${refund}C at most from the Fixture it replaces)`);
    expect(rulesText(run.config)).toContain('sells the old Fixture for half its price as part of the buy');
  });

  it('the log says which Fixture a buy replaced and what it sold for', () => {
    const game = new ThroughputTextGame(easyConfig({ startingCapital: 100, targets: [0, 0, 0] }));
    const first = ok(game.take(ok(game.take(game.newSave(1), 'run')).save, 'buy 1 1'));
    const [, oldName, paid] = /^Bought (.+) for (\d+)C into slot 1\./.exec(first.log[0] ?? '') ?? [];
    const replaced = ok(game.take(first.save, 'buy 2 1'));
    expect(replaced.log[0]).toMatch(new RegExp(`^Bought .+ for \\d+C into slot 1, replacing ${oldName} \\(sold for ${Math.floor(Number(paid) / 2)}C\\)\\. Capital \\d+C\\.$`));
  });
});

describe('Quota Cap text', () => {
  it("the trace says where a capped Shift's sales stopped", () => {
    const line = [slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home'))];
    const made = scoreLine(line, context()).total;
    const capped = traceLines(scoreLine(line, context({ boss: boss('quota-cap'), shiftCap: 5 })));
    expect(capped.at(-1)).toMatch(/Shift total \$5 \(its sales stopped at the \$5 Shift cap; Units past it didn't sell\)\.$/);
    expect(capped.join('\n')).toMatch(/Ship sells \d+ × \$[\d.]+ = \$\d+.*, reaching the \$5 Shift cap; \d+ Units unsold/);
    expect(capped.at(-1)).toMatch(/Leftover: \d+ Units cleared for \$0 \(Sales had reached the Shift cap\)\./);
    expect(traceLines(scoreLine(line, context())).at(-1)).toMatch(new RegExp(`Shift total \\$${made}\\.$`));
  });

  it('the Board line gives the cap in dollars, and run says the Shift stops at it', () => {
    const run = quotaCapRun();
    expect(formatView(run, { game: 'throughput', seed: run.seed, actionsTaken: 0 })).toContain(
      `BOARD REVIEW: Quota Cap: ${boss('quota-cap').text} This round: at most $3 a Shift.`,
    );
    expect(boss('quota-cap').text).toContain("past that, Units don't sell, so they use no Demand or Hot boost");
    expect(legalActions(run)).toContain(`run — run Shift 1 of ${run.shiftsThisRound} (makes $3, stopped at the Shift cap; round reaches $3 of $5)`);
  });
});

class PerkRun extends ThroughputRun {
  private readonly fixedPerks: Perks;

  constructor(perks: Perks) {
    super(1);
    this.fixedPerks = perks;
  }

  override get perks(): Perks {
    return this.fixedPerks;
  }
}

describe('content wave 1 text', () => {
  it('the rules list every Board boss and Contract from the content, and how sell-outs grow Demand', () => {
    const text = rulesText(DEFAULT_CONFIG);
    const flat = text.replace(/\s+/g, ' ');
    expect(flat).toContain(`A run meets 4 of these ${BOSSES.length}, drawn at random`);
    for (const boss of BOSSES.filter((b) => b.id !== 'line-shift')) expect(flat).toContain(`${boss.name}: ${boss.text}`);
    expect(flat).toContain('Line Shift: Shift 1 runs on your layout.');
    for (const contract of CONTRACTS) expect(flat).toContain(`- ${contract.name}${contract.targetsCard ? ' (pick a deck card)' : ''}: ${contract.text}`);
    expect(flat).toContain(`by ${Math.round(DEFAULT_CONFIG.demand.sellOutRate * 100)}% of its full Demand (before Saturated or Recession halving; at least +${DEFAULT_CONFIG.demand.sellOutGrowth}) when a Shift sells the last of it`);
    expect(flat).toContain('A sell-all Ship (Export Deal) ignores Demand and doesn\'t use it up.');
    expect(flat).not.toContain('Wholesale Club');
    expect(flat).toContain("Express Lane doesn't stack with Hot: its Ship gets the larger of ×3 (in Shift 1) and Hot ×2");
    expect(flat).toContain('Price Gun: the Ship here and every later one sells at most half its cap');
    expect(flat).toContain('A Station after another Station on the Line multiplies Units by ×1.5 instead of its own ×.');
  });

  it('a Short Week Board shows 3 Shifts in the state and the run action', () => {
    // One round a Year, so round 3 is the Year-3 Board (Short Week's earliest); Years 1–2 skip the Boards this loop can't clear.
    const config = easyConfig({ roundsPerYear: 1 });
    const fits = (s: number) => {
      const ids = new ThroughputRun(s, config).boardBosses.map((b) => b.id);
      return ids[2] === 'short-week' && !ids.slice(0, 2).some((id) => id === 'supply-shock' || id === 'quota-cap');
    };
    const seed = Array.from({ length: 300 }, (_, i) => i + 1).find(fits);
    if (seed === undefined) throw new Error('no seed has a Short Week Board in Year 3');
    const game = new ThroughputTextGame(config);
    let save = game.newSave(seed);
    while ((game.show(save).state as { round: number }).round < 3) {
      const hand = handOf(game, save);
      save = play(game, seed, [...save.actions, `load ${numberOf(hand, 'make')}:1 ${numberOf(hand, 'ship')}:2`, 'run', 'continue']);
    }
    const view = game.show(save);
    expect(view.text).toContain('Shift 1 of 3 · Sales');
    expect(view.legalActions.find((a) => a.startsWith('run —'))).toMatch(/^run — run Shift 1 of 3 /);
    expect(view.state).toMatchObject({ shiftsThisRound: 3 });
  });

  it('lists Contract perks, including Treasury Bond Capital', () => {
    expect(perksText(new ThroughputRun(1))).toBe('');
    const run = new PerkRun({ hotPips: 1, retools: 2, coupon: 1 });
    expect(perksText(run)).toBe('Perks: +1 Hot pip a round, +2 Retools a round, +1C a round (Treasury Bond).');
  });
});

describe('rules and shop text', () => {
  it('the rules match the engine on Hot pips and explain how a sale is priced, with numbers from the config', () => {
    const text = rulesText(DEFAULT_CONFIG);
    expect(text).toContain('A Shift in which a Hot Ship card sells at least\n    1 Unit spends 1 pip');
    expect(text).not.toContain('first 2 Shifts');
    expect(text).toContain('HOW A SALE IS PRICED');
    expect(text).toContain('  3. Leftover Units clear at $1 each, and that counts toward Sales.');
    expect(text).toContain('In every Shift of a Board Review, when the Batch\n    reaches the Warehouse (even with no card there), the whole stock sells');
    expect(text).toContain('A Rebrand that has already resolved this Shift (another copy, or the same card under Robot Arm)\n       gives ×1.5 instead of ×2.');
    expect(text).toContain('Revenue is rounded down once per sale');
    expect(text).toContain('Line Shift: Shift 1 runs on your layout. From Shift 2 on');
    expect(text).toContain('The opening hand always holds at least one Make and one Ship');
    expect(text).toContain('It also holds a Design while a Mod that works only on Designs (Quality Lab, Design Studio, R&D');
    expect(rulesText({ ...DEFAULT_CONFIG, designOpener: false })).not.toContain('It also holds a Design');
    expect(text).toContain("It also holds a Ship of this round's Hot Category, if your deck has one.");
    expect(rulesText({ ...DEFAULT_CONFIG, hotOpener: false })).not.toContain('Hot Category, if your deck');
    expect(rulesText({ ...DEFAULT_CONFIG, openingHandTypes: [] })).toContain("The opening hand holds a Ship of this round's Hot Category");
    expect(text).toContain("After each later Shift's refill or a Retool, if neither your hand nor the Line has a Ship that can\n  sell (its Category has Demand left), the next such Ship");
    expect(rulesText({ ...DEFAULT_CONFIG, shipRefill: false })).not.toContain("later Shift's refill");
    expect(text).toContain("1 Truck (Ship up to its Category's Demand)");
    expect(text).toContain('Restock: Once per round, when you would draw from an empty draw pile');
    expect(rulesText({ ...DEFAULT_CONFIG, restocksPerRound: 0, openingHandTypes: [] })).toContain('The deck does NOT reshuffle during a round');
    expect(text).toContain(`Targets: Y1 ${DEFAULT_CONFIG.targets.slice(0, 3).join('/')}`);
    expect(rulesText({ ...DEFAULT_CONFIG, handSize: 8 })).toContain('a hand of 8');
    expect(text).toContain(`each full ${DEFAULT_CONFIG.overkill.step * 100}% of the target you sold beyond it pays +1C`);
  });

  it('Express Lane on the Line says it works in Shift 1 only, and is idle after', () => {
    const lane = fixture('express-lane');
    expect(fixtureNow(lane)).toBe('');
    expect(fixtureNow(lane, 1)).toBe('Now ×3 (Shift 1 only).');
    expect(fixtureNow(lane, 2)).toBe('Shift 1 only: ×3; idle now.');
    expect(fixtureText(lane, 3)).toMatch(/^Express Lane \(Mod\): .+ Shift 1 only: ×3; idle now\.$/);
    // A Fixture whose × doesn't depend on the Shift is unchanged.
    expect(fixtureNow(fixture('flagship-store'), 2)).toBe(fixtureNow(fixture('flagship-store')));
    expect(fixtureNow(fixture('quality-lab'), 2)).toBe('');
  });

  it('a shop card offer names its Category and type, in the same words the deck uses', () => {
    expect(offerText({ kind: 'card', def: INFLUENCER, category: 'Food', price: 5 })).toBe('Card · Influencer-F (Food Design) · 5C: Margin ×1.5');
    expect(offerText({ kind: 'card', def: EXPORT_DEAL, category: 'Home', price: 5 })).toBe(
      'Card · Export Deal-H (Home Ship) · 5C: sell all Units at Margin ×0.75 (ignores Demand; leaves none for a later Ship)',
    );
  });
});
