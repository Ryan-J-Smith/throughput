import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cardView, lineFaces } from '../browser';
import { SKETCH, TRUCK, WORKSHOP } from '../content';
import { ThroughputRun, scoreLine } from '../rules';
import { ShiftReplay } from '../spectacle';
import { boss, card, context, easyConfig, slot } from './fixtures';

/** A run at the second round's first Shift with a Station bought into bay 1 and a hand card loaded in bay 2. */
function runWithStation(): ThroughputRun {
  const run = new ThroughputRun(1, easyConfig({ startingCapital: 1000, targets: [0, 0, 0] }));
  run.runShift();
  for (let guard = 0; guard < 80; guard++) {
    const offer = run.offers.findIndex((o) => o?.kind === 'fixture' && o.def.kind === 'station');
    if (offer >= 0) {
      run.buy(offer, { slot: 0 });
      run.continueToNextRound();
      run.load([{ hand: 0, slot: 1 }]);
      return run;
    }
    run.reroll();
  }
  throw new Error('no Station offered in 80 rerolls');
}

/** The slot tiles of a rendered replay: each one's kind, whether it draws a face, and the face's title. */
function slots(html: string): string[] {
  return [...html.matchAll(/<li class="tp-replay__slot"[^>]*?data-kind="(\w+)"([^>]*)>(.*?)<\/li>/g)].map(([, kind, attrs, inner]) => {
    const title = /class="card__title">([^<]*)</.exec(inner ?? '')?.[1];
    return `${kind}${attrs?.includes('data-face') ? ` face:${title ?? '?'}` : ''}`;
  });
}

describe('THROUGHPUT replay card faces', () => {
  it('the Line gives each bay its face: the loaded card, else a Station, else nothing', () => {
    const run = runWithStation();
    const faces = lineFaces(run);
    const loaded = run.line[1]?.card?.card;
    expect(loaded).toBeDefined();
    expect(faces).toHaveLength(run.line.length);
    expect(faces[0]?.tags).toEqual(['Fixture · Station']);
    expect(faces[0]?.title).toBe(run.line[0]?.fixture?.def.name);
    // The loaded card reads as the bay shows it during a Shift (Demand left included).
    expect(faces[1]).toEqual(loaded === undefined ? null : cardView(loaded, 'replay-1', run.demandLeft));
    expect(faces.slice(2)).toEqual([null, null, null]);
  });

  it('draws each slot with a face as its card on the belt; a welded slot and a slot without one keep the name tile', () => {
    const line = [slot(null, card(SKETCH, 'Home')), slot(null, card(WORKSHOP, 'Home')), slot(null, card(TRUCK, 'Home')), slot(null, null)];
    const result = scoreLine(line, context({ boss: boss('supply-shock') }));
    const faces = line.map((s, i) => (s.card === null ? null : cardView(s.card, `replay-${i}`)));
    const html = renderToStaticMarkup(<ShiftReplay result={result} shift={1} faces={faces} />);

    const welded = result.steps.findIndex((s) => s.welded);
    expect(welded).toBeGreaterThanOrEqual(0);
    const expected = result.steps.map((s, i) => (s.welded ? 'welded' : s.card === null ? 'empty' : `card face:${faces[i]?.title ?? '?'}`));
    expect(slots(html)).toEqual(expected);
    // The name stays in every tile for screen readers; the drawn card is hidden from them.
    expect(html).toContain('<span class="tp-replay__face" aria-hidden="true">');
    expect(html.match(/class="tp-replay__name"/g)).toHaveLength(result.steps.length);
  });

  it('without faces the belt shows name tiles, as before', () => {
    const result = scoreLine([slot(null, card(SKETCH, 'Home')), slot(null, card(TRUCK, 'Home'))], context());
    const html = renderToStaticMarkup(<ShiftReplay result={result} shift={2} />);
    expect(html).not.toContain('tp-replay__face');
    expect(slots(html)).toEqual(['card', 'card']);
  });
});
