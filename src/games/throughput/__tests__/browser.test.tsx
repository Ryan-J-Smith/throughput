import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GrantPicker, HowToPlay, KEYS_HINT, LineView, MarketBoard, PayoutSlip, Shelf, ThroughputBrowserGame, ThroughputScreen, TpHud, TraceReceipt, cardView, demandBossCut, demandViews, eventHelp, fixtureView, lineNotice, nextBoardNotice, overkillHelp, plateText } from '../browser';
import { cardText, demandUseText, grownText } from '../cli';
import { DEFAULT_CONFIG, REBRAND, SKETCH, TRUCK, WORKSHOP } from '../content';
import type { BayState } from '../browser';
import { CATEGORIES, cardEffect, cardName, growthText } from '../model';
import type { Category, Stage } from '../model';
import { ThroughputRun, scoreLine } from '../rules';
import type { LineSlot } from '../rules';
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
    expect(html).toContain('or drag it onto a bay, or double-click it to fill the first empty bay');
    expect(html).toContain(`<li data-step="keys"><strong>Keys.</strong> ${KEYS_HINT}</li></ol>`);
  });

  it('hand cards drag and double-click, and the Run button says its key', () => {
    const html = renderToStaticMarkup(<ThroughputScreen seed={1} onQuit={() => {}} store={new MemoryStore()} resume={false} />);
    expect(html.match(/<button type="button" class="card card--windowed card--interactive"[^>]*draggable="true"/g)).toHaveLength(7);
    expect(html).toContain(`title="Keys: ${KEYS_HINT}">Run Shift 1: $0</button>`);
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
    expect(html.match(/<li class="tp-receipt__line[ "]/g)).toHaveLength(5);
    expect(html).toContain('Make +6 Units');
    expect(html).toContain('Ship sells');
    expect(html).toContain(`$${preview.total}`);
    expect(html).toContain('target hit');
    const overkill = renderToStaticMarkup(<TraceReceipt result={preview} heading="If you run now" salesBefore={0} target={5} overkillPay={4} />);
    expect(overkill).toContain('target hit, +4C overkill');
    // In play the word explains itself on hover, with the numbers from the config.
    const explained = renderToStaticMarkup(
      <TraceReceipt result={preview} heading="If you run now" salesBefore={0} target={5} overkillPay={4} overkillHelp={overkillHelp(DEFAULT_CONFIG)} />,
    );
    expect(explained).toContain(
      `target hit, +4C <abbr title="Overkill: when a round clears, each full ${DEFAULT_CONFIG.overkill.step * 100}% of the target you sold past it pays +1C (at most +${DEFAULT_CONFIG.overkill.cap}C a round).">overkill</abbr>`,
    );
  });

  it("under Quota Cap the receipt says the Shift's sales stop at the cap, and the HUD gives the cap in dollars", () => {
    const run = quotaCapRun();
    const preview = run.preview();
    expect(preview.capped).toBe(true);
    const html = renderToStaticMarkup(<TraceReceipt result={preview} heading="If you run now" salesBefore={0} target={5} />);
    expect(html).toContain(
      `<li class="tp-receipt__line tp-receipt__line--capped"><span class="tp-receipt__slot"></span><span class="tp-receipt__what">Shift cap $3 reached<small>Sales stop here: later Units don&#x27;t sell or use Demand</small></span><span class="tp-receipt__batch"></span><span class="tp-receipt__amount">${preview.overCap > 0 ? `-$${preview.overCap}` : ''}</span></li>`,
    );
    expect(html).toContain('Round $3 of $5: $2 to go');
    expect(renderToStaticMarkup(<TpHud run={run} />)).toContain(`${boss('quota-cap').text.replace(/'/g, '&#x27;')} This round: at most $3 a Shift.</span>`);
    // Uncapped, no cap line.
    expect(renderToStaticMarkup(<TraceReceipt result={scoreLine([slot(null, card(WORKSHOP, 'Home'))], context())} heading="Shift" salesBefore={0} target={10} />)).not.toContain('tp-receipt__line--capped');
  });

  it('a receipt can carry a note under its slots, such as what a Shift with no Ship still earns', () => {
    const result = scoreLine([slot(null, card(WORKSHOP, 'Home'))], context());
    const html = renderToStaticMarkup(<TraceReceipt result={result} heading="If you run now" salesBefore={0} target={10} note="No Ship on the Line." />);
    expect(html).toContain('</ol><p class="tp-receipt__note">No Ship on the Line.</p><div class="receipt__total">');
    expect(renderToStaticMarkup(<TraceReceipt result={result} heading="Shift" salesBefore={0} target={10} />)).not.toContain('tp-receipt__note');
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
    expect(shelf()).toContain('It tops out at +5C: Capital above 25C earns nothing.');
    run.wallet.earn(25 - run.wallet.cash);
    expect(shelf()).toContain('>Holding 25C → +5C interest (max)</span>');
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
    // The bought offer's Sold plate can hold focus, so a keyboard buy doesn't drop focus to the page.
    expect(shelf(null)).toContain('<div class="shop__item tp-shop__sold" tabindex="-1"');
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
    expect(html).toMatch(/<span class="tp-piles" role="img" aria-label="Draw pile \d+ \(\d+ Ships? left to draw\), 0 discarded, Restock ready">/);
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

  it('the HUD shows what running now would add as pending, apart from the banked Sales', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [100, 100, 100] }));
    const pending = renderToStaticMarkup(<TpHud run={run} pending={40} />);
    expect(pending).toContain(
      '$0<span class="hud__target"> of $100 target</span><span class="tp-hud__pending" data-sign="up" title="Not banked yet: what this Shift adds to Sales if you run it now">+$40 if you run</span>',
    );
    expect(pending).toContain('aria-valuenow="0"');
    expect(pending).toContain('<div class="tp-hud__bar-pending" style="left:0%;width:40%"></div>');
    // Past the target the ghost stops at the end of the bar; a Shift that costs money has no ghost.
    expect(renderToStaticMarkup(<TpHud run={run} pending={250} />)).toContain('style="left:0%;width:100%"');
    const costs = renderToStaticMarkup(<TpHud run={run} pending={-6} />);
    expect(costs).toContain('data-sign="down"');
    expect(costs).toContain('−$6 if you run');
    expect(costs).not.toContain('tp-hud__bar-pending');
    // Nothing pending, or a reveal landing: no pending label.
    for (const html of [renderToStaticMarkup(<TpHud run={run} pending={0} />), renderToStaticMarkup(<TpHud run={run} pending={40} reveal={{ from: 0, to: 40 }} />)]) {
      expect(html).not.toContain('tp-hud__pending');
    }
  });

  it('the HUD Capital tile says what Capital is for', () => {
    const html = renderToStaticMarkup(<TpHud run={new ThroughputRun(1)} />);
    expect(html).toContain('<div class="hud__stat hud__stat--cash" title="Capital (C) is what you spend in the shop between rounds. Only Sales ($) count toward the target.">');
  });

  it('the receipt heads its columns, and its rule terms explain themselves on hover', () => {
    const result = scoreLine([slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home'))], context());
    const html = renderToStaticMarkup(<TraceReceipt result={result} heading="Shift" salesBefore={0} target={10} baseMargin={2} />);
    expect(html).toContain('<div class="tp-receipt__line tp-receipt__cols"><span class="tp-receipt__slot-head" title="Slot">#</span><span>What ran</span>');
    expect(html).toContain('<abbr title="Units in the Batch after this slot: Makes add Units, and Ships sell them.">Units</abbr>');
    expect(html).toContain(`<abbr title="Margin: the $ each Unit sells for. Every Shift&#x27;s Batch starts at $2; Designs, Handoffs and Fixtures raise it.">Margin</abbr>`);
    expect(html).toContain('<span class="tp-receipt__amount">Sold</span></div>');
    expect(html).toContain('<small><abbr title="Handoff: a card right after another card of the same Category adds +$1 Margin.">Handoff +$1</abbr>; ');
  });

  it('the Market lists each Board ahead by name and gist, with the full rule on hover', () => {
    const run = new ThroughputRun(1);
    const [next] = run.upcomingBoards();
    if (next === undefined) throw new Error('no Board ahead');
    const html = renderToStaticMarkup(<MarketBoard run={run} />);
    expect(html).toContain(`<li data-boss="${next.boss.id}" title="${next.boss.name}: ${next.boss.text.replace(/'/g, '&#x27;')}">`);
    expect(html).toContain(`${next.boss.name}: <span class="tp-market__board-gist">${next.boss.short}</span></li>`);
  });

  it('a Fixture card names itself a Fixture, with Mod or Station as its kind', () => {
    expect(fixtureView(fixture('quality-lab').def, 'f').tags).toEqual(['Fixture · Mod']);
    expect(fixtureView(fixture('assembly-line').def, 'f').tags).toEqual(['Fixture · Station']);
  });

  it('the Market says what the Hot pips are, and Demand growth in plain words', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [100_000, 100_000] }));
    const hot = CATEGORIES.find((c) => run.trendsNow[c] === 'hot') ?? '';
    const pips = `${run.hotPipsLeft} Hot boosts left this round: each Shift that sells ${hot} sells it at ×2 and uses one`;
    const preview = { ...run.preview(), demandSold: { Home: 5 }, demandGrowth: { Home: 10 }, soldOut: ['Home'] as Category[] };
    const html = renderToStaticMarkup(<MarketBoard run={run} preview={preview} />);
    expect(html).toContain(`<span class="tp-pips" role="img" aria-label="${pips}" title="${pips}">`);
    expect(html).toContain('this Shift sells it out, growing Demand +10 next round');
    expect(html).toContain('title="Selling a Category out, or selling an Emerging one, grows its Demand for good from next round."');
    const emerging = { ...preview, soldOut: [] as Category[], emergingSold: ['Home'] as Category[] };
    expect(renderToStaticMarkup(<MarketBoard run={run} preview={emerging} />)).toContain('this Shift grows Demand +10 next round');
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
    expect(growthText(workshop)).toBe('+3 grown on Automation');
    expect(growthText(card(WORKSHOP, 'Food'))).toBe('');
    expect(cardView(workshop).tags).toContain('+3 grown on Automation');
    expect(cardText(workshop)).toBe('Workshop-F · Make: +9 Units (+3 grown on Automation)');
    expect(grownText([sketch, workshop, workshop, workshop])).toBe('Sketch-H +$1, Workshop-F +3 Units');
  });

  it('a Design that takes Margin away reads -$, not +$-', () => {
    const rebrand = card(REBRAND, 'Home');
    expect(cardView(rebrand).valueLabel).toBe('-$2');
    expect(cardEffect(rebrand)).toBe('Design: -$2 Margin, then Margin ×2');
  });

  it('a Make after the last Ship says its Units reach no Ship, and why on hover', () => {
    const line = [slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home')), slot(fixture('automation'), card(WORKSHOP, 'Food'))];
    const result = scoreLine(line, context());
    expect(result.steps[0]?.events).not.toContain('Units reach no Ship');
    expect(result.steps[2]?.events).toContain('Units reach no Ship');
    expect(result.leftover).toBe(6);
    const html = renderToStaticMarkup(<TraceReceipt result={result} heading="If you run now" salesBefore={0} target={100} />);
    expect(html).toContain(`<abbr title="No Ship comes after this slot, so this Make&#x27;s Units don&#x27;t sell: they clear as leftovers at the end of the Shift.">Units reach no Ship</abbr>`);
    // A Line with no Ship at all has its own note, so its Makes don't repeat it.
    expect(scoreLine([line[0] as LineSlot], context()).steps[0]?.events).not.toContain('Units reach no Ship');
  });

  it('a repeat Rebrand on the receipt explains its smaller × on hover', () => {
    const rule = 'A Rebrand that has already resolved this Shift (another copy, or the same card under Robot Arm) gives ×1.5 instead of ×2.';
    expect(eventHelp('2nd Rebrand Margin ×1.5')).toBe(rule);
    expect(eventHelp('3rd Rebrand Margin ×1.5')).toBe(rule);
    expect(eventHelp('Design Margin ×2')).toBeUndefined();
    const result = scoreLine([slot(fixture('robot-arm'), card(REBRAND, 'Food'))], context());
    const html = renderToStaticMarkup(<TraceReceipt result={result} heading="If you run now" salesBefore={0} target={100} />);
    expect(html).toContain(`<abbr title="${rule}">2nd Rebrand Margin ×1.5</abbr>`);
  });

  it('a plate shows the short gist (or the rule) and keeps what the Fixture does now', () => {
    const flagship = fixture('flagship-store', 2);
    const now = /Now ×[\d.]+\.$/;
    expect(plateText(flagship)).toMatch(now);
    expect(plateText({ ...flagship, def: { ...flagship.def, short: 'Ship ×1.2, grows' } })).toMatch(new RegExp(`^Ship ×1\\.2, grows ${now.source}`));
    expect(plateText({ ...fixture('quality-lab'), def: { ...fixture('quality-lab').def, short: undefined } })).toBe('A Design here gets +$4.');
    expect(plateText({ ...fixture('quality-lab'), def: { ...fixture('quality-lab').def, short: '+$4 to a Design' } })).toBe('+$4 to a Design');
  });

  it('each loaded card says whether it stays for later Shifts or is used up this Shift', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    run.load([
      { hand: handIndex(run, 'design'), slot: 0 },
      { hand: handIndex(run, 'make'), slot: 1 },
    ]);
    const html = renderLine(run);
    expect(html).toContain('Loaded, stays for later Shifts');
    expect(html).toContain('Loaded, used up this Shift');
    expect(html).toContain('title="Goes to your discard pile when this Shift runs."');
  });

  it('a parked card says it stays all round, and Scrap says it only discards', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    const design = handIndex(run, 'design');
    const card = run.hand[design];
    if (card === undefined) throw new Error('no Design in hand');
    const name = cardName(card);
    run.load([{ hand: design, slot: 0 }]);
    run.runShift();
    const html = renderToStaticMarkup(<LineView run={run} bayState={() => 'idle'} onBay={() => {}} onScrap={() => {}} bayLabel={(i) => `Bay ${i + 1}`} />);
    expect(html).toContain('title="Stays on the Line for the rest of the round, adding its effect to every Shift.">Parked since Shift 1');
    expect(html).toContain(`aria-label="Scrap ${name} from bay 1" title="Discard this parked card to free the bay. It goes to your discard pile, not out of your deck."`);
  });

  it('the shop says when the next round is a Board Review: its gist, with the full rule on hover', () => {
    const config = easyConfig({ roundsPerYear: 3, targets: [0, 0, 10_000], startingCapital: 100 });
    const run = new ThroughputRun(1, config);
    const boss = run.bossOf(3);
    if (boss === null) throw new Error('no Board in round 3');
    expect(nextBoardNotice(run)).toBeNull();
    run.runShift();
    // Shopping before Q2: no Board next, so no notice.
    expect(nextBoardNotice(run)).toBeNull();
    expect(renderToStaticMarkup(<PayoutSlip run={run} />)).not.toContain('tp-payout__next');
    run.continueToNextRound();
    run.runShift();
    expect(nextBoardNotice(run)).toEqual({ boss, text: `Y1 Board Review · ${boss.name}: ${boss.short}`, help: `${boss.name}: ${boss.text}` });
    const slip = renderToStaticMarkup(<PayoutSlip run={run} />);
    expect(slip).toContain(`<p class="tp-payout__next" data-boss="${boss.id}" title="${boss.name}: ${boss.text.replace(/'/g, '&#x27;')}">`);
    expect(slip).toContain(`<span class="tp-payout__next-label">Next round:</span> Y1 Board Review · ${boss.name}: ${boss.short}</p>`);
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
    // The shop's warning is the general Board notice; the Line itself says nothing until the round.
    expect(nextBoardNotice(run)?.text).toBe('Y1 Board Review · Line Shift: Fixtures drift right');
    expect(lineNotice(run)).toBeNull();
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
    // One round a Year, so round 3 is the Year-3 Board (Recession's earliest).
    const config = easyConfig({ roundsPerYear: 1 });
    const seed = Array.from({ length: 300 }, (_, i) => i + 1).find((x) => new ThroughputRun(x, config).boardBosses[2]?.id === 'recession');
    if (seed === undefined) throw new Error('no seed has a Recession Board in Year 3');
    const run = new ThroughputRun(seed, config);
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
