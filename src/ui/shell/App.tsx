import { useMemo, useReducer, useState } from 'react';
import { initialPlaceholderState, placeholderReducer, toShellView, toToasts } from '../placeholder';
import type { ShellActions, TallySpeed } from '../types';
import { GameShell } from './GameShell';

/** Wires the placeholder driver into the shell. Swap this wiring for the engine later. */
export function App() {
  const [state, dispatch] = useReducer(placeholderReducer, undefined, initialPlaceholderState);
  // UI preference, not game state.
  const [tallySpeed, setTallySpeed] = useState<TallySpeed>('normal');

  const actions = useMemo<ShellActions>(
    () => ({
      onStart: () => dispatch({ type: 'start' }),
      onToggleSelect: (cardId) => dispatch({ type: 'toggleSelect', cardId }),
      onPlay: () => dispatch({ type: 'play' }),
      onDiscard: () => dispatch({ type: 'discard' }),
      onBuy: (offerId) => dispatch({ type: 'buy', offerId }),
      onReroll: () => dispatch({ type: 'reroll' }),
      onContinue: () => dispatch({ type: 'continue' }),
      onRestart: () => dispatch({ type: 'restart' }),
      onTallyComplete: () => dispatch({ type: 'tallyComplete' }),
      onCashOut: () => dispatch({ type: 'cashOut' }),
      onDismissToast: (toastId) => dispatch({ type: 'dismissToast', toastId }),
    }),
    [],
  );

  return (
    <div className="app">
      <GameShell
        view={toShellView(state)}
        toasts={toToasts(state)}
        actions={actions}
        tallySpeed={tallySpeed}
        onTallySpeedChange={setTallySpeed}
      />
    </div>
  );
}
