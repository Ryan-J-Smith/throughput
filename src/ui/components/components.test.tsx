import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CardView } from '../types';
import { Card } from './Card';
import { Hand } from './Hand';
import { Hud } from './Hud';
import { ModifierRow } from './ModifierRow';

const noop = () => {};

function card(id: string, extra: Partial<CardView> = {}): CardView {
  return { id, title: `Card ${id}`, description: 'desc', tags: [], ...extra };
}

describe('Card', () => {
  it('renders title, badges, tags and description', () => {
    const html = renderToStaticMarkup(
      <Card card={card('a', { cost: 3, value: 12, tags: ['Sales', 'Ops'], description: 'Do things.' })} />,
    );
    expect(html).toContain('Card a');
    expect(html).toContain('$3');
    expect(html).toContain('+12');
    expect(html).toContain('Sales');
    expect(html).toContain('Ops');
    expect(html).toContain('Do things.');
  });

  it('omits badges that are not provided', () => {
    const html = renderToStaticMarkup(<Card card={card('a')} />);
    expect(html).not.toContain('card__badges');
  });

  it('renders as a pressed button when selected and clickable', () => {
    const html = renderToStaticMarkup(<Card card={card('a')} selected onClick={noop} />);
    expect(html).toContain('<button');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('card--selected');
  });

  it('disables via prop or card data', () => {
    expect(renderToStaticMarkup(<Card card={card('a')} disabled onClick={noop} />)).toContain('disabled=""');
    expect(renderToStaticMarkup(<Card card={card('a', { disabled: true })} onClick={noop} />)).toContain('card--disabled');
  });
});

describe('Hand', () => {
  const cards = [card('a'), card('b'), card('c')];

  it('disables unselected cards once max is reached, but not selected ones', () => {
    const html = renderToStaticMarkup(
      <Hand
        cards={cards}
        selectedIds={['a', 'b']}
        maxSelected={2}
        canPlay
        canDiscard
        onToggleSelect={noop}
        onPlay={noop}
        onDiscard={noop}
      />,
    );
    expect(html.match(/card--selected/g)).toHaveLength(2);
    expect(html.match(/card--disabled/g)).toHaveLength(1);
    expect(html).toContain('2/2 selected');
  });

  it('disables Play and Discard per props', () => {
    const html = renderToStaticMarkup(
      <Hand
        cards={cards}
        selectedIds={[]}
        maxSelected={5}
        canPlay={false}
        canDiscard={false}
        onToggleSelect={noop}
        onPlay={noop}
        onDiscard={noop}
      />,
    );
    expect(html.match(/<button type="button" class="btn[^"]*" disabled=""/g)).toHaveLength(2);
  });
});

describe('Hud', () => {
  it('shows every stat', () => {
    const html = renderToStaticMarkup(
      <Hud hud={{ round: 2, targetScore: 140, currentScore: 70, playsLeft: 3, discardsLeft: 1, cash: 25 }} />,
    );
    for (const text of ['140', '70', '$25']) expect(html).toContain(text);
    expect(html).toContain('width:50%');
  });
});

describe('ModifierRow', () => {
  it('fills remaining capacity with empty slots', () => {
    const html = renderToStaticMarkup(
      <ModifierRow
        row={{
          slots: 4,
          locked: false,
          modifiers: [{ id: 'm', title: 'Mod', description: 'd', tags: [], sellValue: 2, canSell: true }],
        }}
      />,
    );
    expect(html).toContain('Mod');
    expect(html.match(/modifier-row__empty/g)).toHaveLength(3);
    expect(html).toContain('1/4');
  });
});
