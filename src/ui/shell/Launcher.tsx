import { useState } from 'react';
import type { BrowserGame } from '../games';
import { HomeScreen } from '../screens';
import type { KeyValueStore } from '../storage';

export type LauncherProps = {
  games: readonly BrowserGame[];
  /** Seed for each launch; the only non-deterministic input. */
  nextSeed: () => number;
  /** Autosaves and preferences. */
  store: KeyValueStore;
  /** Also list `dev` games (dev builds only). */
  showDevGames?: boolean;
};

type Session = { readonly game: BrowserGame; readonly seed: number; readonly resume: boolean };

/** Top of the app: the title, or the launched game under a Menu bar. */
export function Launcher({ games, nextSeed, store, showDevGames = false }: LauncherProps) {
  const [session, setSession] = useState<Session | null>(null);
  const quit = () => setSession(null);

  if (session === null) {
    const listed = games.filter((game) => game.listing !== 'dev' || showDevGames);
    const featured = listed.find((game) => game.listing === 'featured') ?? listed[0];
    if (featured === undefined) throw new Error('No browser games are registered');
    return (
      <div className="app">
        <HomeScreen
          featured={featured}
          others={listed.filter((game) => game !== featured)}
          savedRun={featured.savedRun(store)}
          onNewRun={(seed) => setSession({ game: featured, seed: seed ?? nextSeed(), resume: false })}
          onContinue={() => setSession({ game: featured, seed: nextSeed(), resume: true })}
          onPlay={(game) => setSession({ game, seed: nextSeed(), resume: false })}
        />
      </div>
    );
  }
  const { Screen } = session.game;
  return (
    <div className="app">
      <nav className="launcher-bar" aria-label="Game">
        <button type="button" className="launcher-bar__back" onClick={quit}>
          Menu
        </button>
        <span className="launcher-bar__title">{session.game.title}</span>
      </nav>
      <Screen key={session.seed} seed={session.seed} onQuit={quit} store={store} resume={session.resume} />
    </div>
  );
}
