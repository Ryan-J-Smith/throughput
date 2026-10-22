import { useMemo, useReducer } from 'react';
import { initialPlaceholderState, placeholderReducer, toShellView } from '../placeholder';
import type { ShellActions } from '../types';
import { GameShell } from './GameShell';

/** Wires the placeholder driver into the shell. Swap this wiring for the engine later. */
export function App() {
  const [state, dispatch] = useReducer(placeholderReducer, undefined, initialPlaceholderState);

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
    }),
    [],
  );

  return (
    <div className="app">
      <GameShell view={toShellView(state)} actions={actions} />
    </div>
  );
}
