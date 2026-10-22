import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HudView, ShellActions, ShellView, ToastView } from '../types';
import { GameShell } from './GameShell';

const noop = () => {};
const actions: ShellActions = {
  onStart: noop,
  onToggleSelect: noop,
  onPlay: noop,
  onDiscard: noop,
  onBuy: noop,
  onReroll: noop,
  onContinue: noop,
  onRestart: noop,
  onTallyComplete: noop,
  onCashOut: noop,
  onDismissToast: noop,
};
const hud: HudView = { round: 1, targetScore: 100, currentScore: 0, playsLeft: 4, discardsLeft: 3, cash: 10 };
const modifierRow = { slots: 5, modifiers: [] };

const views: Array<[ShellView, string]> = [
  [{ screen: 'title' }, 'screen--title'],
  [
    {
      screen: 'round',
      hud,
      modifierRow,
      hand: [],
      selectedIds: [],
      maxSelected: 5,
      canPlay: false,
      canDiscard: false,
      handLocked: false,
    },
    'screen--round',
  ],
  [{ screen: 'shop', hud, modifierRow, offers: [], rerollCost: 3, canReroll: true }, 'screen--shop'],
  [{ screen: 'gameOver', hud }, 'screen--game-over'],
  [{ screen: 'victory', hud }, 'screen--victory'],
];

function render(view: ShellView, toasts: readonly ToastView[] = []): string {
  return renderToStaticMarkup(
    <GameShell view={view} toasts={toasts} actions={actions} tallySpeed="normal" onTallySpeedChange={noop} />,
  );
}

const roundBase = views[1]![0];

describe('GameShell', () => {
  it.each(views)('routes %o to its screen', (view, cls) => {
    expect(render(view)).toContain(cls);
  });

  it('renders toasts over any screen', () => {
    expect(render({ screen: 'title' }, [{ id: 't', kind: 'error', message: 'Not enough cash' }])).toContain(
      'Not enough cash',
    );
  });

  it('shows the tally in the round play area when present', () => {
    if (roundBase.screen !== 'round') throw new Error('fixture');
    const html = render({
      ...roundBase,
      handLocked: true,
      tally: { id: 'x', finalTotal: 10, contributions: [{ id: 'c', sourceLabel: 'Widget', kind: 'add', amount: 10 }] },
    });
    expect(html).toContain('Score breakdown');
    expect(html).toContain('Widget');
  });

  it('prefers the round summary over the tally', () => {
    if (roundBase.screen !== 'round') throw new Error('fixture');
    const html = render({
      ...roundBase,
      tally: { id: 'x', finalTotal: 10, contributions: [] },
      summary: { heading: 'Round 1 cleared', lines: [{ label: 'Base', amount: 5 }], total: 5 },
    });
    expect(html).toContain('Round 1 cleared');
    expect(html).not.toContain('Score breakdown');
  });
});
