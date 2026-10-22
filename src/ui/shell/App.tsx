import { useState, useSyncExternalStore } from 'react';
import type { ShellModel } from '../model';
import type { TallySpeed } from '../types';
import { GameShell } from './GameShell';

export type AppProps = {
  model: ShellModel;
};

/** Renders whatever `model` says; all game state lives in the model. The Launcher supplies the page frame. */
export function App({ model }: AppProps) {
  const view = useSyncExternalStore(model.subscribe, () => model.getView());
  const toasts = useSyncExternalStore(model.subscribe, () => model.getToasts());
  // UI preference, not game state.
  const [tallySpeed, setTallySpeed] = useState<TallySpeed>('normal');

  return (
    <GameShell view={view} toasts={toasts} actions={model.actions} tallySpeed={tallySpeed} onTallySpeedChange={setTallySpeed} />
  );
}
