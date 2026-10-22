import { useState } from 'react';
import type { BrowserGame } from '../games';
import { GamePicker } from '../screens';

export type LauncherProps = {
  games: readonly BrowserGame[];
  /** Seed for each launch; the only non-deterministic input. */
  nextSeed: () => number;
};

type Session = { readonly game: BrowserGame; readonly seed: number };

/** Top of the app: the game picker, or the picked game under an "All games" bar. */
export function Launcher({ games, nextSeed }: LauncherProps) {
  const [session, setSession] = useState<Session | null>(null);
  const quit = () => setSession(null);

  if (session === null) {
    return (
      <div className="app">
        <GamePicker games={games} onPick={(game) => setSession({ game, seed: nextSeed() })} />
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
      <Screen key={session.seed} seed={session.seed} onQuit={quit} />
    </div>
  );
}
