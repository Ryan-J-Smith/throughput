import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HudView, ShellActions, ShellView } from '../types';
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
};
const hud: HudView = { round: 1, targetScore: 100, currentScore: 0, playsLeft: 4, discardsLeft: 3, cash: 10 };
const modifierRow = { slots: 5, modifiers: [] };

const views: Array<[ShellView, string]> = [
  [{ screen: 'title' }, 'screen--title'],
  [
    { screen: 'round', hud, modifierRow, hand: [], selectedIds: [], maxSelected: 5, canPlay: false, canDiscard: false },
    'screen--round',
  ],
  [{ screen: 'shop', hud, modifierRow, offers: [], rerollCost: 3, canReroll: true }, 'screen--shop'],
  [{ screen: 'gameOver', hud }, 'screen--game-over'],
  [{ screen: 'victory', hud }, 'screen--victory'],
];

describe('GameShell', () => {
  it.each(views)('routes %o to its screen', (view, cls) => {
    expect(renderToStaticMarkup(<GameShell view={view} actions={actions} />)).toContain(cls);
  });
});
