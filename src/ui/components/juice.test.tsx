import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';
import { RoundSummary } from './RoundSummary';
import { ScoreTally } from './ScoreTally';
import { ToastStack } from './ToastStack';
import { Tooltip } from './Tooltip';

const noop = () => {};

describe('ScoreTally', () => {
  const tally = {
    id: 't',
    finalTotal: 40,
    labelA: 'Revenue',
    labelB: 'Margin',
    contributions: [
      { id: '1', sourceLabel: 'Widget', kind: 'add' as const, amount: 20 },
      { id: '2', sourceLabel: 'Doubler', kind: 'xmult' as const, amount: 2 },
    ],
  };

  it('lists every source up front, pending until revealed', () => {
    const html = renderToStaticMarkup(<ScoreTally tally={tally} speed="normal" onComplete={noop} />);
    expect(html).toContain('Widget');
    expect(html).toContain('Doubler');
    expect(html.match(/tally__source--pending/g)).toHaveLength(2);
    expect(html).toContain('Revenue');
    expect(html).toContain('Margin');
  });

  it('renders a speed toggle only when a handler is given', () => {
    expect(renderToStaticMarkup(<ScoreTally tally={tally} speed="fast" onComplete={noop} />)).not.toContain('Speed:');
    expect(
      renderToStaticMarkup(<ScoreTally tally={tally} speed="fast" onComplete={noop} onSpeedChange={noop} />),
    ).toContain('Speed: fast');
  });
});

describe('Tooltip', () => {
  const tooltip = { body: 'Long text', glossary: [{ term: 'Ops', definition: 'Operations' }] };

  it('starts closed with a details toggle', () => {
    const html = renderToStaticMarkup(
      <Tooltip tooltip={tooltip}>
        <span>face</span>
      </Tooltip>,
    );
    expect(html).toContain('face');
    expect(html).toContain('aria-label="Details"');
    expect(html).not.toContain('role="tooltip"');
  });

  it('Card wraps itself in a tooltip only when the card has one', () => {
    const card = { id: 'c', title: 'C', description: 'd', tags: [] };
    expect(renderToStaticMarkup(<Card card={card} />)).not.toContain('tooltip-anchor');
    expect(renderToStaticMarkup(<Card card={{ ...card, tooltip }} />)).toContain('tooltip-anchor');
  });
});

describe('Card rarity', () => {
  it('adds a rarity class', () => {
    const html = renderToStaticMarkup(<Card card={{ id: 'c', title: 'C', description: 'd', tags: [] }} rarity="rare" />);
    expect(html).toContain('card--rarity-rare');
  });
});

describe('RoundSummary', () => {
  it('lists line items and the cash-out total', () => {
    const html = renderToStaticMarkup(
      <RoundSummary
        summary={{
          heading: 'Q2 closed',
          lines: [
            { label: 'Base', amount: 5 },
            { label: 'Interest', amount: 2 },
          ],
          total: 7,
        }}
        onCashOut={noop}
      />,
    );
    expect(html).toContain('Q2 closed');
    expect(html).toContain('Interest');
    expect(html).toContain('Cash out $7');
  });
});

describe('ToastStack', () => {
  it('renders each toast with its kind', () => {
    const html = renderToStaticMarkup(
      <ToastStack
        toasts={[
          { id: '1', kind: 'success', message: 'Target hit!' },
          { id: '2', kind: 'error', message: 'Not enough cash' },
        ]}
        onDismiss={noop}
      />,
    );
    expect(html).toContain('toast--success');
    expect(html).toContain('Target hit!');
    expect(html).toContain('toast--error');
  });
});
