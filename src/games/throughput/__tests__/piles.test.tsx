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
    expect(html).toContain('<span class="tp-pile tp-pile--draw" data-depth="3"><span class="tp-pile__count">13</span>');
    expect(html).toContain('<span class="tp-pile tp-pile--discard" data-depth="0"><span class="tp-pile__count">0</span>');
    expect(renderToStaticMarkup(<PileStack draw={2} discard={5} />)).not.toContain('tp-piles__note');
  });
});
