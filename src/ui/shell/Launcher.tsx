import { useState } from 'react';
import type { BrowserGame } from '../games';
import { GamePicker } from '../screens';
import type { KeyValueStore } from '../storage';

export type LauncherProps = {
  games: readonly BrowserGame[];
  /** Seed for each launch; the only non-deterministic input. */
  nextSeed: () => number;
  /** Autosaves and preferences. */
  store: KeyValueStore;
};

type Session = { readonly game: BrowserGame; readonly seed: number; readonly resume: boolean };

/** Top of the app: the game picker, or the picked game under an "All games" bar. */
export function Launcher({ games, nextSeed, store }: LauncherProps) {
  const [session, setSession] = useState<Session | null>(null);
  const quit = () => setSession(null);

  if (session === null) {
    return (
      <div className="app">
        <GamePicker
          games={games}
          savedRun={(game) => game.savedRun(store)}
          onPick={(game) => setSession({ game, seed: nextSeed(), resume: false })}
          onContinue={(game) => setSession({ game, seed: nextSeed(), resume: true })}
        />
      </div>
    );
  }
  const { Screen } = session.game;
  return (
    <div className="app">
      <nav className="launcher-bar" aria-label="Game">
        <button type="button" className="launcher-bar__back" onClick={quit}>
          All games
        </button>
        <span className="launcher-bar__title">{session.game.title}</span>
      </nav>
      <Screen key={session.seed} seed={session.seed} onQuit={quit} store={store} resume={session.resume} />
    </div>
  );
}
