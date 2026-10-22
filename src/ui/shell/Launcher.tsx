import { useEffect, useState } from 'react';
import type { BrowserGame } from '../games';
import { HomeScreen } from '../screens';
import { SettingsPanel, SettingsStore, applySettings } from '../settings';
import type { Settings } from '../settings';
import { SilentPlayer } from '../sound';
import type { SoundPlayer } from '../sound';
import type { KeyValueStore } from '../storage';

export type LauncherProps = {
  games: readonly BrowserGame[];
  /** Seed for each launch; the only non-deterministic input. */
  nextSeed: () => number;
  /** Autosaves and preferences. */
  store: KeyValueStore;
  /** Also list `dev` games (dev builds only). */
  showDevGames?: boolean;
  /** Plays sound cues; the launcher configures it from Settings and unlocks it on the first gesture. */
  sound?: SoundPlayer;
};

const SILENT = new SilentPlayer();

type Session = { readonly game: BrowserGame; readonly seed: number; readonly resume: boolean };

/** Top of the app: the title, or the launched game under a Menu bar; Settings open over either. */
export function Launcher({ games, nextSeed, store, showDevGames = false, sound = SILENT }: LauncherProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [settingsStore] = useState(() => new SettingsStore(store));
  const [settings, setSettings] = useState<Settings>(() => settingsStore.load());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const quit = () => setSession(null);

  useEffect(() => applySettings(settings, document.documentElement), [settings]);
  useEffect(() => sound.configure(settings.sound, settings.volume), [sound, settings]);
  // Browsers only start audio from a user gesture; capture runs this before the game's own handlers.
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener('click', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('click', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, [sound]);

  const tipGames = games.filter((game) => game.hasTips);
  const settingsPanel = settingsOpen && (
    <SettingsPanel
      settings={settings}
      onChange={(next) => {
        settingsStore.save(next);
        setSettings(next);
        // Apply sound now rather than after the render, so turning it on or moving the volume
        // plays a click at the new level.
        sound.configure(next.sound, next.volume);
        sound.unlock();
        if (next.sound && (!settings.sound || next.volume !== settings.volume)) sound.play('select');
      }}
      {...(tipGames.length > 0 ? { onResetTips: () => tipGames.forEach((game) => game.resetTips(store)) } : {})}
      onClose={() => setSettingsOpen(false)}
    />
  );

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
          onSettings={() => setSettingsOpen(true)}
        />
        {settingsPanel}
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
        <button type="button" className="launcher-bar__settings" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
      </nav>
      <Screen key={session.seed} seed={session.seed} onQuit={quit} store={store} resume={session.resume} sound={sound} />
      {settingsPanel}
    </div>
  );
}
