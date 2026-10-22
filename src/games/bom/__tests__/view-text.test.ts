import { describe, expect, it } from 'vitest';
import { STARTING_BLUEPRINTS, defaultBomConfig } from '../content';
import { makePart } from '../model';
import type { BomRun } from '../rules';
import { BomTextGame, buildBomView, formatBomView } from '../text';
import type { BomView } from '../text';
import { clearRound, deckOf, flatTargets, runWith, shipAnything } from './helpers';

// Display fixes and clarity text from BoM playtest round 1 (bugs B1–B5, clarity C1–C17).

const text = (run: BomRun): string => formatBomView(buildBomView(run, { game: 'bom', seed: 1, actionsTaken: 0 }));
const view = (run: BomRun): BomView => buildBomView(run, { game: 'bom', seed: 1, actionsTaken: 0 });

const seedFor = (id: string): number => {
  for (let seed = 1; seed < 200; seed++) if (runWith({}, seed).disruptions[0]?.id === id) return seed;
  throw new Error(id);
};

/** Clears Q1 Small, Big and Boss with tiny targets, stopping in the shop after the Boss. */
function afterQ1Boss(seed: number): BomRun {
  const run = runWith({ targets: flatTargets(1) }, seed);
  for (let round = 0; round < 3; round++) {
    clearRound(run);
    if (round < 2) run.leaveShop();
  }
  return run;
}

describe('BoM display fixes', () => {
  it('B1: the shop after a Boss no longer lists that quarter’s disruption', () => {
    const run = afterQ1Boss(seedFor('strike'));
    expect(run.phase).toBe('shop');
    expect(text(run)).not.toMatch(/Q1 Boss disruption/);
  });

  it('B1: upcoming Boss disruptions are still listed before the Boss', () => {
    const run = runWith({ targets: flatTargets(1) }, seedFor('strike'));
    clearRound(run);
    expect(text(run)).toMatch(/Q1 Boss disruption \(revealed\): Strike — −1 Build in the Boss round/);
  });

  it('B2: the blueprint count says how many are Products and Subs', () => {
    expect(text(runWith())).toMatch(/Blueprints 4\/6 \(3 Products \+ 1 Sub\)/);
  });

  it('B4: Products show Ships this round and this run; Recall names the leader', () => {
    const run = runWith({ targets: flatTargets(1) }, seedFor('recall'));
    const shipped = shipAnything(run);
    run.collect();
    const shown = text(run);
    expect(shown).toMatch(new RegExp(`${shipped}.*shipped 0 this round / 1 this run`));
    expect(shown).toMatch(new RegExp(`Recall — .*most-shipped now: ${shipped} \\(1 ship\\)`));
  });

  it('B5: the shop deck list keeps Premium copies apart', () => {
    const deck = deckOf(['paint', 2], ['paint', 2], ['shell', 2], ['shell', 3], ['chip', 2], ['chip', 3], ['bolt', 2], ['bolt', 3]);
    const run = runWith({ targets: flatTargets(1), startingDeck: () => [...deck(), makePart('paint', 2, { premium: true })] });
    clearRound(run);
    expect(view(run).shop?.deck).toMatchObject({ 'Paint 2': 2, 'Paint 2 premium': 1 });
  });
});

describe('BoM clarity text', () => {
  it('teaches the formula, the Build cost and the piles in a round', () => {
    const shown = text(runWith());
    expect(shown).toMatch(/Revenue = min\(Units, Demand\) × Price × multipliers/);
    expect(shown).toMatch(/Paint, which adds its grade to Price/);
    expect(shown).toMatch(/Ship and Fab each use 1 Build/);
    expect(shown).toMatch(/Hand \(8\) · draw pile 24 · discard 0/);
    expect(shown).toMatch(/Cash \$4 \(interest at next clear: \$0 — \$1 per \$5 held before the payout, max \$5\)/);
  });

  it('legal fab and ship actions say they cost a Build, and fab projects its output', () => {
    const actions = view(runWith()).legalActions;
    expect(actions.filter((a) => a.startsWith('ship ')).every((a) => a.includes('1 Build'))).toBe(true);
    expect(actions.find((a) => a.startsWith('fab '))).toMatch(/1 Build: Motor = Chip\+Bolt → Bench, .*: Chip \d \+ Bolt \d → Motor \d+ \(e\.g\. fab \d \d\)$/);
  });

  it('shred says it costs money; R&D Grants list per-blueprint effects', () => {
    for (let seed = 1; seed < 300; seed++) {
      const run = runWith({ targets: flatTargets(1), startingCash: 20 }, seed);
      clearRound(run);
      const actions = view(run).legalActions;
      expect(actions.find((a) => a.startsWith('shred'))).toMatch(/PAY \$2 to remove one part .*once per shop visit/);
      const rnd = actions.find((a) => /^buy \d+ <blueprint>/.test(a));
      if (rnd === undefined) continue;
      expect(rnd).toMatch(/desk-fan scale \+8 Units\/\+25 Demand, premium \+\$2/);
      expect(rnd).toMatch(/motor \+3 grade/);
      return;
    }
    throw new Error('no R&D offer found');
  });

  it('flags Blueprint offers that need a Sub you do not own', () => {
    for (let seed = 1; seed < 300; seed++) {
      const run = runWith({ targets: flatTargets(1), startingBlueprints: STARTING_BLUEPRINTS }, seed);
      clearRound(run);
      const offer = view(run).shop?.offers.find((o) => o.text.includes('Bookshelf'));
      if (offer === undefined) continue;
      expect(offer.text).toMatch(/needs the Frame Sub, which you don't own/);
      return;
    }
    throw new Error('no Bookshelf offer found');
  });
});

describe('BoM clarity logs', () => {
  const game = new BomTextGame('bom', () => ({ ...defaultBomConfig(), targets: flatTargets(1) }));
  const start = game.show(game.newSave(5));
  /** The suggested example of the first legal action starting with `verb`. */
  const example = (verb: string): string => start.legalActions.map((a) => new RegExp(`\\(e\\.g\\. (${verb} .+)\\)$`).exec(a)?.[1]).find(Boolean) as string;
  /** The log of the last of `actions`, played from a fresh seed-5 save. */
  const lastLog = (actions: readonly string[]): string => {
    let save = game.newSave(5);
    let log: readonly string[] = [];
    for (const action of actions) {
      const result = game.take(save, action);
      if (!result.ok) throw new Error(`${action}: ${result.reason}`);
      ({ save, log } = result);
    }
    return log.join('\n');
  };

  it('preview says whether the Ship clears the target', () => {
    const parts = example('ship').split(' ').slice(2).join(' ');
    expect(lastLog([`preview ${parts}`])).toMatch(/clears the target \(\$\d+ over is not paid\)/);
  });

  it('Overtime entry explains Ship pay, stocking, collect and the Scrap lock', () => {
    expect(lastLog([example('ship')])).toMatch(
      /TARGET REACHED \(\d+\/1\): Overtime\. Ships now pay cash \(\$1 per 0\.25 revenue, max \$5 more this round\); .* collect \$3 for unused Builds\. Scraps are locked/,
    );
  });

  it('fab logs its Build cost', () => {
    expect(lastLog([example('fab')])).toMatch(/^Fabricated Motor \d+ from Chip \d \+ Bolt \d → Bench \(1 Build used, 3 left\)/);
  });
});

describe('stock and Overtime Ships (approved rule change)', () => {
  const deck = deckOf(['chip', 4], ['chip', 1], ['bolt', 3], ['bolt', 1], ['shell', 2], ['shell', 1], ['paint', 1], ['paint', 1]);
  const game = new BomTextGame('bom', () => ({ ...defaultBomConfig(), targets: flatTargets(1), startingDeck: deck }));

  it('BomView.stock names the fab, and `stock` is recorded as that concrete fab', () => {
    const save = game.newSave(1);
    const before = game.show(save);
    const stock = (before.state as BomView).stock;
    expect(stock).toMatchObject({ product: 'desk-fan', sub: 'motor', output: 'Motor 14' });
    expect(before.legalActions).toContain(`stock — 1 Build: fab Motor 14 from Chip 4 + Bolt 3 for Desk Fan (same as fab ${stock?.parts})`);
    const result = game.take(save, 'stock');
    if (!result.ok) throw new Error(result.reason);
    expect(result.save.actions).toEqual([`fab ${stock?.parts}`]);
    expect(result.log[0]).toBe('Fabricated Motor 14 from Chip 4 + Bolt 3 → Bench for Desk Fan (1 Build used, 3 left)');
  });

  it('refuses `stock` when nothing can be stocked', () => {
    const benched = new BomTextGame('bom', () => ({ ...defaultBomConfig(), startingBench: () => [makePart('motor', 9, { fabricated: true })] }));
    const result = benched.take(benched.newSave(1), 'stock');
    expect(result.ok).toBe(false);
  });

  it('in Overtime, Ships stay legal and say what they pay; Scrap is gone; the view shows Overtime pay', () => {
    let save = game.newSave(1);
    const ship = game.show(save).legalActions.map((a) => /\(e\.g\. (ship .+)\)$/.exec(a)?.[1]).find(Boolean) as string;
    const result = game.take(save, ship);
    if (!result.ok) throw new Error(result.reason);
    save = result.save;
    const v = result.view.state as BomView;
    expect(v.phase).toBe('overtime');
    expect(v.overtime).toEqual({ revenuePerDollar: 0.25, earned: 0, cap: 5 });
    expect(result.view.legalActions.some((a) => /^ship \S+ <parts…> — 1 Build \(Overtime cash: \$1 per 0\.25 revenue, max \$5 more this round\)/.test(a))).toBe(true);
    expect(result.view.legalActions.some((a) => a.startsWith('scrap'))).toBe(false);
  });
});

