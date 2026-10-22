import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LineView, ThroughputBrowserGame, ThroughputScreen, TraceReceipt, lineNotice } from '../browser';
import type { BayState } from '../browser';
import type { Stage } from '../model';
import { ThroughputRun } from '../rules';
import { MemoryStore } from '../../../ui/storage';
import { easyConfig } from './fixtures';

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
  it('opens on Shift 1 with the Line, the Market board and an empty preview receipt', () => {
    const html = renderToStaticMarkup(<ThroughputScreen seed={1} onQuit={() => {}} store={new MemoryStore()} resume={false} />);
    expect(html).toContain('Run Shift 1: $0');
    expect(html.match(/class="tp-bay /g)).toHaveLength(5);
    expect(html).toContain('aria-label="Market"');
    expect(html).toContain('of $150 target');
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
