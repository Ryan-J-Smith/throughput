import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../engine/rng';
import { LineView, RunSummaryView, runSummary } from '../browser';
import type { ThroughputConfig } from '../content';
import { ThroughputRun } from '../rules';
import { GreedyBot } from '../sim';
import { easyConfig } from './fixtures';

/** Plays a whole run with GreedyBot. */
function playOut(seed: number, config?: ThroughputConfig): ThroughputRun {
  const run = new ThroughputRun(seed, config);
  const bot = new GreedyBot();
  bot.beginRun(run, new Rng(seed).fork('bot'));
  while (run.phase === 'shift' || run.phase === 'shop') {
    if (run.phase === 'shift') {
      const d = bot.shiftTurn(run);
      if (d.kind === 'load') run.load(d.placements);
      else if (d.kind === 'retool') run.retool(d.hand);
      else if (d.kind === 'scrap') run.scrap(d.slots);
      else run.runShift();
    } else {
      const d = bot.shopTurn(run);
      if (d.kind === 'buy') run.buy(d.offer, d.target);
      else if (d.kind === 'sellFixture') run.sellFixture(d.slot);
      else if (d.kind === 'sellCard') run.sellCard(d.deckCard);
      else if (d.kind === 'move') run.moveFixture(d.from, d.to);
      else if (d.kind === 'reroll') run.reroll();
      else run.continueToNextRound();
    }
  }
  return run;
}

/** The first run from `from` on that GreedyBot loses (and, if asked, that bought an R&D Grant). */
function lostRun(from: number, boughtGrant = false): ThroughputRun {
  for (let seed = from; seed < from + 200; seed++) {
    const run = playOut(seed);
    const granted = Object.values(run.grants).some((g) => g.scale + g.premium > 0);
    if (run.phase === 'lost' && (!boughtGrant || granted)) return run;
  }
  throw new Error(`no lost run from seed ${from}`);
}

describe('THROUGHPUT run summary', () => {
  it('each round records what every Shift made', () => {
    const run = lostRun(29);
    for (const record of run.history) {
      expect(record.shiftTotals).toHaveLength(record.shiftsUsed);
      expect(record.shiftTotals.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(record.sales);
    }
  });

  it('sums a lost run: total sales, best Shift, rounds cleared, the Line and the seed', () => {
    const run = lostRun(29);
    const summary = runSummary(run);
    const last = run.history[run.history.length - 1];
    if (last === undefined) throw new Error('no rounds');
    const best = Math.max(...run.history.flatMap((r) => r.shiftTotals));
    expect(summary).toMatchObject({
      won: false,
      totalSales: run.history.reduce((sum, r) => sum + r.sales, 0),
      roundsCleared: run.history.length - 1,
      rounds: run.rounds,
      seed: run.seed,
    });
    expect(summary.bestShift?.total).toBe(best);
    expect(summary.bestShift?.where).toMatch(/^Year \d (Q\d|Board Review), Shift \d$/);
    expect(summary.outcome).toMatch(/^Missed the Year \d (Q\d|Board Review) target by \$[\d,]+\.$/);
    expect(summary.outcome).toContain(`by $${(last.target - last.sales).toLocaleString('en-US')}.`);
    expect(summary.line).toHaveLength(run.line.length);
    expect(summary.line.filter((f) => f !== null)).toHaveLength(run.line.filter((s) => s.fixture !== null).length);
    expect(summary.cards).toHaveLength(run.deck.filter((c) => c.paid > 0 || c.upgrades > 0 || c.growth > 0).length);
  });

  it('lists the R&D Grants bought', () => {
    const run = lostRun(1, true);
    const expected = Object.entries(run.grants)
      .filter(([, g]) => g.scale + g.premium > 0)
      .map(([c, g]) => `${c} ${[g.scale > 0 ? `Scale ${g.scale}` : '', g.premium > 0 ? `Premium ×${1 + 0.25 * g.premium}` : ''].filter(Boolean).join(', ')}`);
    expect(expected.length).toBeGreaterThan(0);
    expect(runSummary(run).grants).toEqual(expected);
  });

  it('sums a won run', () => {
    const run = playOut(5, easyConfig());
    expect(run.phase).toBe('won');
    const summary = runSummary(run);
    expect(summary.won).toBe(true);
    expect(summary.roundsCleared).toBe(3);
    expect(summary.outcome).toBe('Cleared all 3 rounds, through the Year 1 Board Review.');
  });

  it('renders the headline, stats, build thumbnails and seed', () => {
    const run = lostRun(29);
    const summary = runSummary(run);
    const html = renderToStaticMarkup(<RunSummaryView run={run} onNewRun={() => {}} onQuit={() => {}} copy={async () => {}} />);
    expect(html).toContain('data-screen="run-summary"');
    expect(html).toContain(`data-outcome="lost" data-year="${run.quarter.year}"`);
    expect(html).toContain('<h1 class="tp-summary__title">Run over</h1>');
    expect(html).toContain(`aria-label="Total sales $${summary.totalSales.toLocaleString('en-US')}"`);
    expect(html).toContain('Best Shift');
    expect(html).toContain(`<code class="tp-summary__seed-value">${run.seed}</code>`);
    expect(html).toContain('Copy seed');
    expect(html.match(/class="card card--compact/g)?.length ?? 0).toBe(summary.line.filter((f) => f !== null).length + summary.cards.length);
  });
});

describe('THROUGHPUT art slots', () => {
  it('Fixture plates lead with the Fixture\'s art (or its kind\'s icon) and carry data hooks', () => {
    const run = lostRun(29);
    const html = renderToStaticMarkup(<LineView run={run} bayState={() => 'idle'} onBay={() => {}} bayLabel={(slot) => `Bay ${slot + 1}`} />);
    run.line.forEach((slot, i) => {
      if (slot.fixture === null) return;
      const li = new RegExp(`<li class="[^"]*" data-slot="${i + 1}" data-fixture="${slot.fixture.def.id}" data-kind="${slot.fixture.def.kind}"><div class="tp-bay__plate[^"]*"[^>]*><span class="tp-bay__fixture-art`);
      expect(html).toMatch(li);
    });
    const plates = run.line.filter((s) => s.fixture !== null).length;
    expect((html.match(/<img src="[^"]+" alt="" loading="lazy"\/>|<svg class="icon"/g) ?? []).length).toBe(plates);
  });

  it('the run summary names the Board that ended a run on a Board Review', () => {
    for (let seed = 29; seed < 229; seed++) {
      const run = lostRun(seed);
      const last = run.history[run.history.length - 1];
      if (last === undefined || !last.isBoard) continue;
      const boss = run.bossOf(last.round);
      expect(runSummary(run).finalBoss).toEqual({ id: boss?.id, name: boss?.name });
      const html = renderToStaticMarkup(<RunSummaryView run={run} onNewRun={() => {}} onQuit={() => {}} copy={async () => {}} />);
      expect(html).toContain(`data-boss="${boss?.id}"`);
      expect(html).toContain(`Stopped by the Board: <strong>${boss?.name}</strong>`);
      return;
    }
    throw new Error('no run lost on a Board Review');
  });
});
