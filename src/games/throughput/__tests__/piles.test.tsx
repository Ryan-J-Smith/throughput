import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PileStack, pileDepth } from '../browser';

describe('THROUGHPUT draw and discard piles', () => {
  it('stacks more card backs the fuller a pile is, up to four', () => {
    expect([0, 1, 5, 6, 15, 16, 40].map(pileDepth)).toEqual([0, 1, 1, 2, 3, 4, 4]);
  });

  it('shows both counts and says everything in its label', () => {
    const html = renderToStaticMarkup(<PileStack draw={13} discard={0} note="Restock ready" />);
    expect(html).toContain('aria-label="Draw pile 13, 0 discarded, Restock ready"');
    expect(html).toContain('<span class="tp-pile tp-pile--draw" data-depth="3" title="Draw pile: 13 cards"><span class="tp-pile__count">13</span>');
    expect(html).toContain('<span class="tp-pile tp-pile--discard" data-depth="0" title="Discard pile: 0 cards"><span class="tp-pile__count">0</span>');
    expect(renderToStaticMarkup(<PileStack draw={2} discard={5} />)).not.toContain('tp-piles__note');
  });

  it('says how many Ships are left to draw', () => {
    const html = renderToStaticMarkup(<PileStack draw={9} discard={4} ships={2} note="Restock ready" />);
    expect(html).toContain('aria-label="Draw pile 9 (2 Ships left to draw), 4 discarded, Restock ready"');
    expect(html).toContain('<span class="tp-piles__ships">2 Ships left to draw</span><span class="tp-piles__note">Restock ready</span>');
    expect(renderToStaticMarkup(<PileStack draw={9} discard={4} ships={1} />)).toContain('>1 Ship left to draw<');
    expect(renderToStaticMarkup(<PileStack draw={9} discard={4} />)).not.toContain('tp-piles__ships');
  });

  it('explains its note on hover', () => {
    const html = renderToStaticMarkup(<PileStack draw={9} discard={4} note="Restock ready" noteHelp="Restock: once a round, discards refill an empty draw pile." />);
    expect(html).toContain('<span class="tp-piles__note" title="Restock: once a round, discards refill an empty draw pile.">Restock ready</span>');
  });
});
