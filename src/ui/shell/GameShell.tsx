import { ToastStack } from '../components';
import { EndScreen, RoundScreen, ShopScreen, TitleScreen } from '../screens';
import type { ShellActions, ShellView, TallySpeed, ToastView } from '../types';

export type GameShellProps = {
  view: ShellView;
  toasts: readonly ToastView[];
  actions: ShellActions;
  tallySpeed: TallySpeed;
  onTallySpeedChange: (speed: TallySpeed) => void;
};

/** Screen router: picks a screen from `view.screen`. Holds no state of its own. */
export function GameShell({ view, toasts, actions, tallySpeed, onTallySpeedChange }: GameShellProps) {
  return (
    <>
      <ToastStack toasts={toasts} onDismiss={actions.onDismissToast} />
      <Screen view={view} actions={actions} tallySpeed={tallySpeed} onTallySpeedChange={onTallySpeedChange} />
    </>
  );
}

function Screen({ view, actions, tallySpeed, onTallySpeedChange }: Omit<GameShellProps, 'toasts'>) {
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
          handLocked={view.handLocked}
          tally={view.tally}
          summary={view.summary}
          tallySpeed={tallySpeed}
          onTallySpeedChange={onTallySpeedChange}
          onTallyComplete={actions.onTallyComplete}
          onCashOut={actions.onCashOut}
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
