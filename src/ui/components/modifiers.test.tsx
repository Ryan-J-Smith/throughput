import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ModifierView } from '../types';
import { Hand } from './Hand';
import { ModifierRow } from './ModifierRow';

const noop = () => {};

function mod(id: string, extra: Partial<ModifierView> = {}): ModifierView {
  return { id, title: `Mod ${id}`, description: '', tags: [], sellValue: 3, canSell: true, ...extra };
}

const row = (locked = false) => ({ slots: 4, locked, modifiers: [mod('a'), mod('b'), mod('c')] });

/** Disabled state of each button with the given aria-label, in document order. */
function disabledByLabel(html: string, label: string): boolean[] {
  const re = new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`, 'g');
  return (html.match(re) ?? []).map((tag) => tag.includes('disabled=""'));
}

describe('ModifierRow controls', () => {
  it('renders no controls without callbacks', () => {
    const html = renderToStaticMarkup(<ModifierRow row={row()} />);
    expect(html).not.toContain('modifier-actions');
    expect(html).not.toContain('draggable="true"');
  });

  it('shows Sell with the sell value and nudges disabled at the ends', () => {
    const html = renderToStaticMarkup(<ModifierRow row={row()} onSell={noop} onMove={noop} />);
    expect(html.match(/Sell \$3/g)).toHaveLength(3);
    expect(disabledByLabel(html, 'Move Mod a left')).toEqual([true]);
    expect(disabledByLabel(html, 'Move Mod b left')).toEqual([false]);
    expect(disabledByLabel(html, 'Move Mod c right')).toEqual([true]);
    expect(html.match(/draggable="true"/g)).toHaveLength(3);
  });

  it('locks every control and dragging while locked', () => {
    const html = renderToStaticMarkup(<ModifierRow row={row(true)} onSell={noop} onMove={noop} />);
    expect(html).not.toContain('draggable="true"');
    expect(disabledByLabel(html, 'Move Mod b left')).toEqual([true]);
    expect(html.match(/modifier-actions__sell[^"]*" disabled=""/g)).toHaveLength(3);
  });

  it('dims Sell when the owner says it cannot sell, but keeps it clickable', () => {
    const html = renderToStaticMarkup(
      <ModifierRow row={{ slots: 2, locked: false, modifiers: [mod('a', { canSell: false })] }} onSell={noop} />,
    );
    expect(html).toContain('modifier-actions__sell btn--unaffordable');
    expect(html).not.toMatch(/modifier-actions__sell[^"]*" disabled=""/);
  });
});

describe('Hand sort toggle', () => {
  const props = {
    cards: [],
    selectedIds: [],
    maxSelected: 5,
    canPlay: false,
    canDiscard: false,
    onToggleSelect: noop,
    onPlay: noop,
    onDiscard: noop,
  };

  it('is hidden without onSortChange', () => {
    expect(renderToStaticMarkup(<Hand {...props} />)).not.toContain('hand__sort');
  });

  it('marks the active sort as pressed', () => {
    const html = renderToStaticMarkup(<Hand {...props} sort="group" onSortChange={noop} />);
    expect(html).toContain('aria-pressed="false">Sort by value');
    expect(html).toContain('aria-pressed="true">Sort by group');
  });
});
