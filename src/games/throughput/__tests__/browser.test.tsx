import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GrantPicker, HowToPlay, LineView, Shelf, ThroughputBrowserGame, ThroughputScreen, TpHud, TraceReceipt, cardView, demandBossCut, demandViews, lineNotice, plateText } from '../browser';
import { cardText, demandUseText, grownText } from '../cli';
import { DEFAULT_CONFIG, REBRAND, SKETCH, TRUCK, WORKSHOP } from '../content';
import type { BayState } from '../browser';
import { CATEGORIES, cardEffect, growthText } from '../model';
import type { Category, Stage } from '../model';
import { ThroughputRun, scoreLine } from '../rules';
import { MemoryStore } from '../../../ui/storage';
import { boss, card, context, easyConfig, fixture, quotaCapRun, shopWithFixture, slot } from './fixtures';

function handIndex(run: ThroughputRun, stage: Stage): number {
  const i = run.hand.findIndex((c) => c.def.stage === stage);
  if (i < 0) throw new Error(`no ${stage} card in hand`);
  return i;
}

/** The bay buttons' labels, each marked with whether it can be tapped. */
function bayButtons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*class="tp-bay__spot"[^>]*>/g)].map((m) => {
    const label = /aria-label="([^"]*)"/.exec(m[0])?.[1] ?? '?';
    return `${label}${m[0].includes('disabled') ? ' (inert)' : ''}`;
  });
}

function renderLine(run: ThroughputRun, bayState: (slot: number) => BayState = () => 'idle'): string {
  return renderToStaticMarkup(<LineView run={run} bayState={bayState} onBay={() => {}} bayLabel={(slot) => `Bay ${slot + 1}`} />);
}

describe('THROUGHPUT browser screen', () => {
  it('has a short How to play for the title, with numbers from the config', () => {
    expect(new ThroughputBrowserGame().HowToPlay).toBe(HowToPlay);
    const html = renderToStaticMarkup(<HowToPlay config={{ ...easyConfig(), shiftsPerRound: 5, retoolsPerRound: 3, handSize: 8, restocksPerRound: 0 }} />);
    expect(html).toContain('up to 5 Shifts');
    expect(html).toContain('Retool (3 per round)');
    expect(html).toContain('draw back up to 8');
    expect(html).not.toContain('refilled from your discards');
  });

  it('opens on Shift 1 with the Line, the Market board and an empty preview receipt', () => {
    const html = renderToStaticMarkup(<ThroughputScreen seed={1} onQuit={() => {}} store={new MemoryStore()} resume={false} />);
    expect(html).toContain('Run Shift 1: $0');
    expect(html.match(/class="tp-bay /g)).toHaveLength(5);
    expect(html).toContain('aria-label="Market"');
    expect(html).toContain(`of $${DEFAULT_CONFIG.targets[0]} target`);
    expect(html).toContain('If you run now');
  });

  it('every bay can be tapped during a Shift', () => {
    const run = new ThroughputRun(1, easyConfig());
    expect(bayButtons(renderLine(run)).every((b) => !b.endsWith('(inert)'))).toBe(true);
  });

  it('between rounds a bay holding a Fixture can be tapped to move or sell it; empty bays only when they accept one', () => {
    const run = new ThroughputRun(1, easyConfig({ startingCapital: 100 }));
    run.load([
      { hand: handIndex(run, 'make'), slot: 3 },
      { hand: handIndex(run, 'ship'), slot: 4 },
    ]);
    run.runShift();
    expect(run.phase).toBe('shop');
    run.buy(0, { slot: 2 });

    expect(bayButtons(renderLine(run))).toEqual(['Bay 1 (inert)', 'Bay 2 (inert)', 'Bay 3', 'Bay 4 (inert)', 'Bay 5 (inert)']);
    expect(bayButtons(renderLine(run, () => 'target')).every((b) => !b.endsWith('(inert)'))).toBe(true);
  });

  it('the receipt prints one line per slot with the Batch events and the Shift total', () => {
    const run = new ThroughputRun(1, easyConfig());
    run.load([
      { hand: handIndex(run, 'make'), slot: 3 },
      { hand: handIndex(run, 'ship'), slot: 4 },
    ]);
    const preview = run.preview();
    const html = renderToStaticMarkup(<TraceReceipt result={preview} heading="If you run now" salesBefore={0} target={10} />);
    expect(html.match(/class="tp-receipt__line[ "]/g)).toHaveLength(5);
    expect(html).toContain('Make +6 Units');
    expect(html).toContain('Ship sells');
    expect(html).toContain(`$${preview.total}`);
    expect(html).toContain('target hit');
    const overkill = renderToStaticMarkup(<TraceReceipt result={preview} heading="If you run now" salesBefore={0} target={5} overkillPay={4} />);
    expect(overkill).toContain('target hit, +4C overkill');
  });

  it('under Quota Cap the receipt takes off what is over the cap, and the HUD gives the cap in dollars', () => {
    const run = quotaCapRun();
    const preview = run.preview();
    expect(preview.overCap).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<TraceReceipt result={preview} heading="If you run now" salesBefore={0} target={5} />);
    expect(html).toContain(
      `<li class="tp-receipt__line tp-receipt__line--capped"><span class="tp-receipt__slot"></span><span class="tp-receipt__what">Shift cap $3<small>$${preview.overCap} over the cap doesn&#x27;t count</small></span><span class="tp-receipt__batch"></span><span class="tp-receipt__amount">-$${preview.overCap}</span></li>`,
    );
    expect(html).toContain('Round $3 of $5: $2 to go');
    expect(renderToStaticMarkup(<TpHud run={run} />)).toContain('Sales past that are lost. This round: at most $3 a Shift.</span>');
  });

  it('receipt lines lay out the Fixture as a chip, struck through when idle, then the card', () => {
    const line = [slot(fixture('quality-lab'), card(SKETCH, 'Home')), slot(null, card(WORKSHOP, 'Home')), slot(fixture('quality-lab'), card(TRUCK, 'Home')), slot(null, null)];
    const html = renderToStaticMarkup(<TraceReceipt result={scoreLine(line, context())} heading="Shift" salesBefore={0} target={10} />);
    const whats = [...html.matchAll(/<span class="tp-receipt__what">(.*?)(<small>|<\/span><span class="tp-receipt__batch")/g)].map((m) => m[1]);
    expect(whats[0]).toMatch(/^<span class="tp-receipt__fixture" data-kind="mod" title="Quality Lab"><svg class="icon tp-receipt__fixture-icon".*<\/svg>Quality Lab<\/span> <span class="tp-receipt__card">Sketch-H<\/span>$/);
    expect(whats[1]).toBe('<span class="tp-receipt__card">Workshop-H</span>');
    expect(whats[2]).toContain('class="tp-receipt__fixture" data-kind="mod" data-idle="true" title="Quality Lab: idle for this card"');
    expect(whats[3]).toBe('<span class="tp-receipt__card">Empty</span>');
    expect(html).toContain('class="tp-receipt__line is-empty ">');

    const welded = scoreLine(line, context({ boss: boss('supply-shock') }));
    const weldedHtml = renderToStaticMarkup(<TraceReceipt result={welded} heading="Shift" salesBefore={0} target={10} />);
    expect(weldedHtml).toContain('class="tp-receipt__line  is-welded"><span class="tp-receipt__slot">1</span><span class="tp-receipt__what"><span class="tp-receipt__card">Welded shut</span></span>');
  });

  it('Fixture plates carry the full rule as a tooltip and tag an idle Fixture', () => {
    // A run whose first shop offers a Quality Lab, which does nothing for a Make or Ship card.
    let run = new ThroughputRun(0);
    for (let seed = 1; seed < 500 && run.offers[0]?.def.id !== 'quality-lab'; seed++) {
      run = new ThroughputRun(seed, easyConfig());
      run.load([
        { hand: handIndex(run, 'make'), slot: 1 },
        { hand: handIndex(run, 'ship'), slot: 2 },
      ]);
      run.runShift();
    }
    run.buy(0, { slot: 0 });
    expect(renderLine(run)).toContain('title="Quality Lab (Mod): A Design here gets +$4."');
    run.continueToNextRound();
    run.load([{ hand: run.hand.findIndex((c) => c.def.stage !== 'design'), slot: 0 }]);
    expect(renderLine(run)).toContain('<span class="tp-bay__idle" title="Idle for this card">Idle</span>');
  });

  it('shop offers say what kind they are and whether you can afford them', () => {
    const run = new ThroughputRun(1, easyConfig());
    run.load([
      { hand: handIndex(run, 'make'), slot: 0 },
      { hand: handIndex(run, 'ship'), slot: 1 },
    ]);
    run.runShift();
    const shelf = () => renderToStaticMarkup(<Shelf run={run} pending={null} replacing={null} onBuy={() => {}} onReroll={() => {}} onContinue={() => {}} />);
    const items = () => [...shelf().matchAll(/<div class="shop__item ?" data-kind="(\w+)" data-afford="(yes|no)"/g)].map((m) => [m[1], m[2]]);
    expect(items()).toEqual(run.offers.flatMap((o) => (o === null ? [] : [[o.kind, run.wallet.canAfford(o.price) ? 'yes' : 'no']])));
    expect(shelf()).toMatch(/<span class="tp-shop__interest"[^>]*>Holding \d+C → \+\d+C interest<\/span>/);
    run.wallet.spend(run.wallet.cash);
    expect(items().map(([, afford]) => afford)).toEqual(run.offers.flatMap((o) => (o === null ? [] : [o.price > 0 ? 'no' : 'yes'])));
  });

  it('with a Line Fixture picked, each Fixture offer says what it replaces, and its refund counts toward affording it', () => {
    const run = shopWithFixture();
    const old = run.line[0]?.fixture?.def.name ?? '';
    const refund = run.fixtureRefund(0);
    const price = run.offers[1]?.price ?? 0;
    run.wallet.spend(run.wallet.cash - (price - refund));
    const shelf = (replacing: number | null) => renderToStaticMarkup(<Shelf run={run} pending={null} replacing={replacing} onBuy={() => {}} onReroll={() => {}} onContinue={() => {}} />);
    const offer = (html: string, i: number) => html.split('<div class="shop__item')[i + 1] ?? '';
    const picked = shelf(0);
    expect(offer(picked, 1)).toContain(`<div class="shop__ledge" aria-hidden="true"></div><p class="shop__note">Replaces ${old} (+${refund}C)</p><button`);
    expect(offer(picked, 1)).toContain('data-afford="yes"');
    expect(offer(picked, 2)).not.toContain('shop__note');
    expect(shelf(null)).not.toContain('shop__note');
    // Unpicked, the offer is still affordable: it can go over the Fixture in slot 1.
    expect(offer(shelf(null), 1)).toContain('data-afford="yes"');
    run.wallet.spend(1);
    expect(offer(shelf(0), 1)).toContain('data-afford="no"');
  });

  it('the screen carries the Year (and Board rounds) for per-Year backdrops', () => {
    const html = renderToStaticMarkup(<ThroughputScreen seed={1} onQuit={() => {}} store={new MemoryStore()} resume={false} />);
    expect(html).toMatch(/<main class="screen screen--tp screen--tp-shift" data-year="1">/);
  });

  it('the Shift controls show the draw and discard piles as card stacks', () => {
    const html = renderToStaticMarkup(<ThroughputScreen seed={1} onQuit={() => {}} store={new MemoryStore()} resume={false} />);
    expect(html).toMatch(/<span class="tp-piles" role="img" aria-label="Draw pile \d+, 0 discarded, Restock ready">/);
    expect(html).not.toContain('hand__count');
  });

  it('the HUD reveal lands a Shift\'s Sales before the Run applies, flagging a hit on the target', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [100, 100, 100] }));
    const score = (html: string) => /<div class="hud__stat hud__stat--score"[^>]*>/.exec(html)?.[0] ?? '';

    const plain = renderToStaticMarkup(<TpHud run={run} />);
    expect(score(plain)).toBe('<div class="hud__stat hud__stat--score">');

    const short = renderToStaticMarkup(<TpHud run={run} reveal={{ from: 0, to: 40 }} />);
    expect(score(short)).toBe('<div class="hud__stat hud__stat--score" data-reveal="done">');
    expect(short).toContain('$40<span class="hud__target"> of $100 target</span>');
    expect(short).toContain('aria-valuenow="40"');

    const hit = renderToStaticMarkup(<TpHud run={run} reveal={{ from: 0, to: 140 }} />);
    expect(score(hit)).toBe('<div class="hud__stat hud__stat--score" data-reveal="done" data-hit="true">');
    expect(hit).toContain('aria-valuenow="100"');
    expect(hit).toContain('style="width:100%"');
  });

  it('the last round shows no Demand growth "from next round"', () => {
    const last = new ThroughputRun(1, easyConfig({ targets: [100_000] }));
    const notLast = new ThroughputRun(1, easyConfig({ targets: [100_000, 100_000] }));
    const preview = { ...last.preview(), demandSold: { Home: 5 }, demandGrowth: { Home: 10 }, soldOut: ['Home'] as Category[] };
    expect(demandUseText(preview, notLast)).toBe('Home 5 (sells out: +10 from next round)');
    expect(demandUseText(preview, last)).toBe('Home 5');
    expect(demandViews(last, preview).find((v) => v.category === 'Home')).toMatchObject({ earned: 0, wouldEarn: 0, sellsOut: true });
    expect(demandViews(notLast, preview).find((v) => v.category === 'Home')?.wouldEarn).toBe(10);

    // Both causes at once are split, so a sell-out's share can be checked.
    const emerging = notLast.config.demand.emergingGrowth;
    const both = { ...preview, demandGrowth: { Home: 15 + emerging }, emergingSold: ['Home'] as Category[] };
    expect(demandUseText(both, notLast)).toBe(`Home 5 (+${15 + emerging} from next round: sell-out +15, Emerging +${emerging})`);
    expect(demandUseText({ ...both, soldOut: [], demandGrowth: { Home: emerging } }, notLast)).toBe(`Home 5 (Emerging sale: +${emerging} from next round)`);
  });

  it('during a Shift a Ship card whose Category sold out says it sells nothing', () => {
    const truck = card(TRUCK, 'Home');
    const left = { Apparel: 5, Gadgets: 5, Home: 0, Food: 5 };
    expect(cardView(truck, 'x', left).tags).toContain('Sold out: sells 0');
    expect(cardView(truck, 'x', { ...left, Home: 3 }).tags).not.toContain('Sold out: sells 0');
    expect(cardView(truck).tags).not.toContain('Sold out: sells 0');
  });

  it('growth reads by card type: R&D Margin on a Design, Automation Units on a Make', () => {
    const sketch = card(SKETCH, 'Home', { growth: 2 });
    const workshop = card(WORKSHOP, 'Food', { growth: 3 });
    expect(growthText(sketch)).toBe('R&D +$2');
    expect(growthText(workshop)).toBe('Automated +3 Units');
    expect(growthText(card(WORKSHOP, 'Food'))).toBe('');
    expect(cardView(workshop).tags).toContain('Automated +3 Units');
    expect(cardText(workshop)).toBe('Workshop-F · Make: +9 Units (Automated +3 Units)');
    expect(grownText([sketch, workshop, workshop, workshop])).toBe('Sketch-H +$1, Workshop-F +3 Units');
  });

  it('a Design that takes Margin away reads -$, not +$-', () => {
    const rebrand = card(REBRAND, 'Home');
    expect(cardView(rebrand).valueLabel).toBe('-$2');
    expect(cardEffect(rebrand)).toBe('Design: -$2 Margin, then Margin ×2');
  });

  it('a plate shows the short gist (or the rule) and keeps what the Fixture does now', () => {
    const flagship = fixture('flagship-store', 2);
    const now = /Now ×[\d.]+\.$/;
    expect(plateText(flagship)).toMatch(now);
    expect(plateText({ ...flagship, def: { ...flagship.def, short: 'Ship ×1.2, grows' } })).toMatch(new RegExp(`^Ship ×1\\.2, grows ${now.source}`));
    expect(plateText({ ...fixture('quality-lab'), def: { ...fixture('quality-lab').def, short: undefined } })).toBe('A Design here gets +$4.');
    expect(plateText({ ...fixture('quality-lab'), def: { ...fixture('quality-lab').def, short: '+$4 to a Design' } })).toBe('+$4 to a Design');
  });

  it('each loaded card says whether it stays after the run', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    run.load([
      { hand: handIndex(run, 'design'), slot: 0 },
      { hand: handIndex(run, 'make'), slot: 1 },
    ]);
    const html = renderLine(run);
    expect(html).toContain('Loaded, stays after the run');
    expect(html).toContain('Loaded, used up by the run');
  });

  it('Line Shift: the shop warns before the Board, and each Shift shows which Fixtures moved', () => {
    const config = easyConfig({ roundsPerYear: 2, targets: [10, 10_000, 10, 10], startingCapital: 100 });
    let seed = 1;
    while (new ThroughputRun(seed, config).boardBosses[0]?.id !== 'line-shift') seed++;
    const run = new ThroughputRun(seed, config);
    run.load([
      { hand: handIndex(run, 'make'), slot: 0 },
      { hand: handIndex(run, 'ship'), slot: 1 },
    ]);
    run.runShift();
    const fixture = run.buy(0, { slot: 0 });
    expect(renderLine(run)).toContain('Next round, Line Shift moves your Fixtures one bay right before each Shift from Shift 2 on.');
    run.continueToNextRound();
    expect(lineNotice(run)).toBe('Line Shift: from Shift 2, your Fixtures move one bay right before each Shift. Tap a parked card to take it back to your hand.');
    run.load([{ hand: handIndex(run, run.hand.some((c) => c.def.stage === 'design') ? 'design' : 'make'), slot: 2 }]);
    run.runShift();
    expect(lineNotice(run)).toBe(`Line Shift moved your Fixtures before this Shift: ${fixture.def.name} 1→2. Cards stay put. Tap a parked card to take it back to your hand.`);
    const html = renderLine(run);
    expect(html).toContain('class="tp-line__notice"');
    expect(html).toContain('moved from bay 1');
  });

  it('registers as a browser game', () => {
    const game = new ThroughputBrowserGame();
    expect([game.id, game.title, game.accent]).toEqual(['throughput', 'Throughput', 'blue']);
  });
});

/** A seed whose round 1 has a Saturated Category and an opening hand with 2 Makes and a Ship of it. */
function saturatedSellOut(): { run: ThroughputRun; category: Category } {
  for (let seed = 1; seed < 300; seed++) {
    const run = new ThroughputRun(seed, easyConfig({ targets: [1000, 1000, 1000] }));
    const category = CATEGORIES.find((c) => run.trendsNow[c] === 'saturated');
    const makes = run.hand.filter((c) => c.def.stage === 'make').length;
    if (category !== undefined && makes >= 2 && run.hand.some((c) => c.def.id === 'truck' && c.category === category)) return { run, category };
  }
  throw new Error('no seed fits');
}

describe('THROUGHPUT Demand in the browser', () => {
  it('bars show this round\'s Demand (halved when Saturated), what this Shift would use, and the growth it earns', () => {
    const { run, category } = saturatedSellOut();
    const full = Math.floor(run.demand[category] * run.config.demand.saturatedMul);
    expect(run.roundDemand[category]).toBe(full);
    expect(run.demandIn(1, category)).toBe(full);
    const make = () => run.hand.findIndex((c) => c.def.stage === 'make');
    run.load([{ hand: make(), slot: 0 }]);
    run.load([{ hand: make(), slot: 1 }]);
    run.load([{ hand: run.hand.findIndex((c) => c.def.id === 'truck' && c.category === category), slot: 2 }]);
    const view = demandViews(run, run.preview()).find((v) => v.category === category);
    expect(view).toMatchObject({ left: full, full, using: full, halved: true, sellsOut: true, wouldEarn: run.config.demand.sellOutGrowth, earned: 0 });

    run.runShift();
    expect(run.demandLeft[category]).toBe(0);
    expect(run.demandEarned[category]).toBe(run.config.demand.sellOutGrowth);
    expect(demandViews(run, run.preview()).find((v) => v.category === category)).toMatchObject({ left: 0, full, earned: run.config.demand.sellOutGrowth });
  });

  it('Market chips carry a Category icon and name, and columns are numbered for the layout', () => {
    const html = renderToStaticMarkup(<ThroughputScreen seed={1} onQuit={() => {}} store={new MemoryStore()} resume={false} />);
    const chips = html.match(/<span class="tp-chip"[^>]*data-category="[A-Za-z]+"[^>]*title="[A-Za-z]+"><svg class="icon tp-chip__icon"/g) ?? [];
    expect(chips.length).toBe(16);
    expect(html).toContain('<span class="tp-chip__name">Apparel</span>');
    expect(html).toMatch(/class="tp-market__quarter is-now" data-col="0"/);
    expect(html).toContain('class="tp-market__cell" data-col="3"');
  });

  it('the Market renders a Demand bar per Category with its cues', () => {
    const { run, category } = saturatedSellOut();
    const html = renderToStaticMarkup(<ThroughputScreen seed={run.seed} onQuit={() => {}} store={new MemoryStore()} resume={false} />);
    expect(html).toContain('Demand left');
    expect(html.match(/class="tp-demand__row"/g)).toHaveLength(4);
    expect(html).toContain(`data-category="${category}"`);
    expect(html).toContain('Saturated: halved');
  });

  it('names a Board boss that cuts Demand (Recession) on the round it plays', () => {
    const seed = Array.from({ length: 300 }, (_, i) => i + 1).find((x) => new ThroughputRun(x, easyConfig()).boardBosses[0]?.id === 'recession');
    if (seed === undefined) throw new Error('no seed opens with a Recession Board');
    const run = new ThroughputRun(seed, easyConfig());
    expect(demandBossCut(run, 1)).toBeNull();
    expect(demandBossCut(run, 3)).toBe('Recession ×0.5');
    expect(run.demandIn(3, 'Food')).toBe(Math.floor(run.demand.Food * 0.5 * (run.trends[2]?.Food === 'saturated' ? 0.5 : 1)));
  });

  it('the R&D Grant picker shows each option\'s effect per Category', () => {
    const run = new ThroughputRun(1);
    const html = renderToStaticMarkup(<GrantPicker run={run} onPick={() => {}} onCancel={() => {}} />);
    expect(html.match(/data-option="scale"/g)).toHaveLength(4);
    expect(html).toContain('Demand 20 → 30 for good, and each Home Ship card adds +3 Units just before it sells');
    expect(html).toContain('Food sells at +0% → +25% price');
  });
});
