import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BIG_SALE_SHARE, HIT_STOP_MS, TpHud, beatReveal, hitStopMs, isBigSale, salesBefore } from '../browser';
import { TRUCK, WORKSHOP } from '../content';
import { ThroughputRun, scoreLine } from '../rules';
import { shiftBeats } from '../spectacle';
import type { Beat } from '../spectacle';
import { card, context, easyConfig, quotaCapRun, slot } from './fixtures';

/** Make, Ship, then an empty slot: the beats, the Ship's sale beat, and the empty one. */
function shiftData() {
  const data = shiftBeats(scoreLine([slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home')), slot(null, null)], context()));
  const [, sale, empty] = data.beats;
  if (sale === undefined || empty === undefined || sale.earned <= 0) throw new Error('expected a sale at slot 2');
  return { data, sale, empty };
}

const runWithTarget = (target: number) => new ThroughputRun(1, easyConfig({ targets: [target, target, target] }));

describe('THROUGHPUT replay HUD', () => {
  it('a sale of a quarter of the target or more is big, and holds the replay for a hit-stop', () => {
    const { sale, empty } = shiftData();
    const exact = runWithTarget(sale.earned / BIG_SALE_SHARE);
    const larger = runWithTarget(sale.earned / BIG_SALE_SHARE + 1);
    expect(isBigSale(exact, sale.earned)).toBe(true);
    expect(isBigSale(larger, sale.earned)).toBe(false);
    expect(isBigSale(exact, 0)).toBe(false);
    expect(hitStopMs(exact, sale)).toBe(HIT_STOP_MS);
    expect(hitStopMs(larger, sale)).toBe(0);
    expect(hitStopMs(exact, empty)).toBe(0);
  });

  it('counts the sales before a beat, so each sale in a Shift sounds a step higher', () => {
    const { data, sale, empty } = shiftData();
    const beats: Beat[] = [sale, empty, sale, sale];
    const shift = { ...data, beats };
    expect([0, 1, 2, 3, 4].map((i) => salesBefore(shift, i))).toEqual([0, 1, 1, 2, 3]);
  });

  it('a beat that sells banks its running Sales in the HUD over most of a step, with its "+$"', () => {
    const { sale, empty } = shiftData();
    const run = runWithTarget(100);
    expect(beatReveal(run, empty, 2, 560)).toBeNull();
    expect(beatReveal(run, sale, 1, 560)).toEqual({
      from: 0,
      to: sale.sales,
      ms: 392,
      sale: { key: 1, amount: sale.earned, big: isBigSale(run, sale.earned) },
    });
  });

  it('under Quota Cap the HUD banks no more than the Shift cap', () => {
    const run = quotaCapRun();
    const cap = run.shiftCap ?? 0;
    const result = run.preview();
    const beat = shiftBeats(result).beats.find((b) => b.earned > 0);
    if (beat === undefined) throw new Error('no sale in the Quota Cap Shift');
    expect(beat.sales).toBeGreaterThan(cap);
    expect(beatReveal(run, beat, 0, 560)?.to).toBe(cap);
  });

  it('the HUD flashes each banked sale beside Sales, and the ghost shows what is still to bank', () => {
    const run = runWithTarget(100);
    const html = renderToStaticMarkup(<TpHud run={run} reveal={{ from: 0, to: 30, ms: 300, sale: { key: 2, amount: 18, big: false } }} pending={20} />);
    expect(html).toContain('$30<span class="hud__target"> of $100 target</span><span class="tp-hud__sale">+$18</span>');
    expect(html).toContain('<div class="tp-hud__bar-pending" style="left:30%;width:20%"></div>');
    // The ghost is still to bank, not a Shift to run: no "if you run" label.
    expect(html).not.toContain('tp-hud__pending');

    const big = renderToStaticMarkup(<TpHud run={run} reveal={{ from: 0, to: 30, sale: { key: 2, amount: 30, big: true } }} />);
    expect(big).toContain('<span class="tp-hud__sale" data-big="true">+$30</span>');
    // The finale's reveal has no sale of its own.
    expect(renderToStaticMarkup(<TpHud run={run} reveal={{ from: 0, to: 30 }} />)).not.toContain('tp-hud__sale');
  });
});
