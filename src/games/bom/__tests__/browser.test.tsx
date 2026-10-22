import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BROWSER_GAMES } from '../../../browser-games';
import { MemoryStore } from '../../../ui/storage';
import { TUNED_TARGETS } from '../content';
import { BomBrowserGame, BomScreen, NextRoundMemo, OvertimeBanner, ProductBoard, Shelf, ShipReceipt, ShredPanel, rulesSections } from '../browser';
import { makePart } from '../model';
import type { Part } from '../model';
import type { BomRun } from '../rules';
import { buildBomView } from '../text';
import { clearRound, config, deckOf, flatTargets, pick, runWith } from './helpers';

function board(run: BomRun, selection: readonly Part[]): string {
  const products = buildBomView(run, { game: 'bom', seed: 1, actionsTaken: 0 }).products;
  return renderToStaticMarkup(<ProductBoard run={run} products={products} round={{ selection, onShip: () => {}, onFabricate: () => {} }} />);
}

function shopBoard(run: BomRun, picking: boolean): string {
  const products = buildBomView(run, { game: 'bom', seed: 1, actionsTaken: 0 }).products;
  return renderToStaticMarkup(<ProductBoard run={run} products={products} shop={{ onSell: () => {}, onRnd: picking ? () => {} : null }} />);
}

describe('BoM browser screen', () => {
  it('opens on Q1 Small with the blueprint board, an empty Bench and the hand', () => {
    const html = renderToStaticMarkup(<BomScreen seed={1} onQuit={() => {}} store={new MemoryStore()} resume={false} />);
    expect(html).toContain(`of $${TUNED_TARGETS[0]?.[0]} target`);
    expect(html).toContain('Small market');
    for (const name of ['Gizmo', 'Flatpack', 'Desk Fan', 'Motor']) expect(html).toContain(name);
    expect(html).toContain('Bench');
    expect(html).toContain('0/2');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(8);
    expect(html).toContain('How to play');
  });

  it('prices the selection on every Product it fits and says what the others need', () => {
    const run = runWith({ startingDeck: deckOf(['shell', 3], ['chip', 2], ['bolt', 1], ['bolt', 2], ['paint', 1]) });
    const html = board(run, [pick(run, 'shell'), pick(run, 'chip')]);
    // Gizmo: min(8 + 3 + 2 Units, 30 Demand) × $2.
    expect(html).toContain('Ship $26');
    expect(html).toContain('13 Units into 30 Demand');
    expect(html).toContain('Needs Shell+Bolt+Bolt');
    expect(html).toContain('Needs Motor+Shell');
  });

  it('Demand bars show the halving after a repeat Ship and the growth from a sell-out', () => {
    const run = runWith({ startingDeck: deckOf(['shell', 20], ['chip', 20], ['shell', 1], ['chip', 1]) });
    // 8 + 20 + 20 Units ≥ 30 Demand: sells out, so Gizmo grows +5 to 35.
    run.ship([pick(run, 'shell', 20), pick(run, 'chip', 20)], 'gizmo');
    const html = board(run, []);
    expect(html).toContain('Demand 17, halved from 35 (shipped ×1 this round), +5 grown from sell-outs');
    expect(html).toContain('bom-demand__growth');
  });

  it('Fabricate shows the output grade, and asks for a Bench part to trash when the Bench is full', () => {
    const deck = deckOf(['chip', 3], ['bolt', 2]);
    const roomy = runWith({ startingDeck: deck });
    expect(board(roomy, [pick(roomy, 'chip'), pick(roomy, 'bolt')])).toContain('Fabricate: Motor 10<');

    const motors = () => [makePart('motor', 9, { fabricated: true }), makePart('motor', 7, { fabricated: true })];
    const full = runWith({ startingDeck: deck, startingBench: motors });
    expect(board(full, [pick(full, 'chip'), pick(full, 'bolt')])).toContain('Fabricate: Motor 10, trash a Bench part');
  });

  it('the receipt itemises the ScoreContext log down to the formula', () => {
    const run = runWith({ startingDeck: deckOf(['shell', 3], ['chip', 2], ['paint', 1]) });
    const quote = run.quoteFor('gizmo', [pick(run, 'shell'), pick(run, 'chip'), pick(run, 'paint')]);
    if (quote === null) throw new Error('no quote');
    const html = renderToStaticMarkup(<ShipReceipt quote={quote} heading="Preview" revenueBefore={10} target={100} sellOutGrowth={5} />);
    expect(html).toContain('Gizmo base');
    expect(html).toContain('8 Units, $2, 30 Demand');
    expect(html).toContain('+3 Units');
    expect(html).toContain('+$1 Price');
    expect(html).toContain('min(13 Units, 30 Demand) × $3');
    expect(html).toContain('$39');
    expect(html).toContain('$51 to go');
  });

  it('the shop shows the Rack, Parts Counter, next round, Shred, and Scale/Premium choices for an R&D Grant', () => {
    const run = runWith({ targets: flatTargets(1), startingCash: 50 });
    clearRound(run);
    expect(run.phase).toBe('shop');
    const shelf = renderToStaticMarkup(<Shelf run={run} pending={null} onBuy={() => {}} onReroll={() => {}} onContinue={() => {}} />);
    expect(shelf).toContain('Rack');
    expect(shelf).toContain('Parts Counter');
    expect(shelf).toContain('Start Q1 Big');
    expect(renderToStaticMarkup(<NextRoundMemo run={run} />)).toContain('Q1 Big');
    expect(renderToStaticMarkup(<ShredPanel run={run} onShred={() => {}} />)).toContain('Deck (32 parts)');

    const picking = shopBoard(run, true);
    expect(picking).toContain('Scale: +4 Units, +15 Demand');
    expect(picking).toContain('Premium: +$1 Price');
    expect(picking).toContain('R&amp;D: +3 output grade');
    expect(shopBoard(run, false)).toContain('Sell $0');
  });

  it('the rules sheet takes its numbers from the config', () => {
    const text = rulesSections(config({ builds: 5, benchSlots: 3 }))
      .flatMap((s) => s.lines)
      .join(' ');
    expect(text).toContain('You get 5 Builds');
    expect(text).toContain('The Bench holds 3 fabricated parts');
  });

  it('in Overtime the tickets Ship for cash, the banner offers Stock and Collect, and Scraps are locked', () => {
    const run = runWith({ targets: flatTargets(1), startingDeck: deckOf(['shell', 3], ['shell', 4], ['chip', 2], ['chip', 3], ['bolt', 2]) });
    run.ship([pick(run, 'shell', 3), pick(run, 'chip', 2)], 'gizmo');
    expect(run.phase).toBe('overtime');
    expect(board(run, [])).not.toContain('Ship locked');

    const again = [pick(run, 'shell', 4), pick(run, 'chip', 3)];
    const quote = run.quoteFor('gizmo', again);
    const banner = renderToStaticMarkup(<OvertimeBanner run={run} onStock={() => {}} onCollect={() => {}} />);
    expect(banner).toContain('Scraps are locked');
    expect(banner).toContain(`Collect $${run.buildsLeft}`);
    expect(banner).toContain('Stock Bench: Motor');
    expect(banner).toContain('for Desk Fan');
    if (quote === null) throw new Error('no Gizmo quote');
    const cash = run.overtimePayFor(quote.revenue);
    expect(cash).toBeGreaterThan(0);
    expect(board(run, again)).toContain(`Ship: +$${cash} cash`);
    const receipt = renderToStaticMarkup(<ShipReceipt quote={quote} heading="Preview" revenueBefore={run.revenue} target={1} sellOutGrowth={5} overtimePay={cash} />);
    expect(receipt).toContain(`Overtime Ship: +$${cash} cash`);
    const rules = rulesSections(config()).flatMap((x) => x.lines).join(' ');
    expect(rules).toContain('can Ship for cash ($1 per 25% of the target');
    expect(rules).not.toContain('Ship locks');
  });

  it('is off the title (retired from the product; the CLI and sim still play it)', () => {
    expect(new BomBrowserGame().id).toBe('bom');
    expect(BROWSER_GAMES.map((g) => g.id)).not.toContain('bom');
  });
});
