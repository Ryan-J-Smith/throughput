import { EndScreen, RoundScreen, ShopScreen, TitleScreen } from '../screens';
import type { ShellActions, ShellView } from '../types';

export type GameShellProps = {
  view: ShellView;
  actions: ShellActions;
};

/** Screen router: picks a screen from `view.screen`. Holds no state of its own. */
export function GameShell({ view, actions }: GameShellProps) {
  switch (view.screen) {
    case 'title':
      return <TitleScreen onStart={actions.onStart} />;
    case 'round':
      return (
        <RoundScreen
          hud={view.hud}
          modifierRow={view.modifierRow}
          hand={view.hand}
          selectedIds={view.selectedIds}
          maxSelected={view.maxSelected}
          canPlay={view.canPlay}
          canDiscard={view.canDiscard}
          onToggleSelect={actions.onToggleSelect}
          onPlay={actions.onPlay}
          onDiscard={actions.onDiscard}
        />
      );
    case 'shop':
      return (
        <ShopScreen
          hud={view.hud}
          modifierRow={view.modifierRow}
          offers={view.offers}
          rerollCost={view.rerollCost}
          canReroll={view.canReroll}
          onBuy={actions.onBuy}
          onReroll={actions.onReroll}
          onContinue={actions.onContinue}
        />
      );
    case 'gameOver':
    case 'victory':
      return <EndScreen outcome={view.screen} hud={view.hud} onRestart={actions.onRestart} />;
  }
}
