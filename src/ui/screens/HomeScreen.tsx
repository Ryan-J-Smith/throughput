import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { BrowserGame } from '../games';
import './home.css';

export type HomeScreenProps = {
  /** The headline game: New run, Continue and How to play act on it. */
  featured: BrowserGame;
  /** Everything else, listed under More games. */
  others: readonly BrowserGame[];
  /** A short description of the featured game's autosaved run, or null if it has none. */
  savedRun: string | null;
  /** Starts the featured game from `seed`, or from a fresh seed if null. Replaces any saved run. */
  onNewRun: (seed: number | null) => void;
  onContinue: () => void;
  onPlay: (game: BrowserGame) => void;
};

/** What's open under the main buttons. */
type Panel = 'none' | 'confirm' | 'seed' | 'how';

/** A typed seed as the run seed, or why it isn't one. */
export function parseSeed(text: string): number | string {
  const trimmed = text.trim();
  if (!/^\d{1,15}$/.test(trimmed)) return 'A seed is a whole number, up to 15 digits.';
  return Number(trimmed);
}

/** The title: the featured game's name and run buttons, with the other games below. */
export function HomeScreen({ featured, others, savedRun, onNewRun, onContinue, onPlay }: HomeScreenProps) {
  const [panel, setPanel] = useState<Panel>('none');
  const [seedText, setSeedText] = useState('');
  const [seedError, setSeedError] = useState<string | null>(null);
  const ids = useId();
  const { HowToPlay } = featured;
  const toggle = (next: Panel) => setPanel(panel === next ? 'none' : next);

  const startSeeded = (event: FormEvent) => {
    event.preventDefault();
    const seed = parseSeed(seedText);
    if (typeof seed === 'string') setSeedError(seed);
    else onNewRun(seed);
  };

  return (
    <main className="screen home" data-screen="home" data-accent={featured.accent}>
      <div className="home__art" data-art="title" aria-hidden="true" />
      <header className="home__header">
        <p className="home__brand">Shelf Life</p>
        <h1 className="home__title">{featured.title}</h1>
        <p className="home__tagline">{featured.tagline}</p>
      </header>

      <section className="home__actions" aria-label="Play">
        {savedRun !== null && (
          <button type="button" className="btn btn--play btn--large home__continue" onClick={onContinue}>
            <span className="home__button-label">Continue</span>
            <span className="home__button-detail">{savedRun}</span>
          </button>
        )}
        <button
          type="button"
          className={`btn btn--large home__new ${savedRun === null ? 'btn--play' : ''}`}
          aria-expanded={savedRun === null ? undefined : panel === 'confirm'}
          onClick={() => (savedRun === null ? onNewRun(null) : toggle('confirm'))}
        >
          New run
        </button>
        <div className="home__secondary">
          <button type="button" className="btn home__seed-toggle" aria-expanded={panel === 'seed'} aria-controls={`${ids}-panel`} onClick={() => toggle('seed')}>
            Custom seed
          </button>
          {HowToPlay !== null && (
            <button type="button" className="btn home__how-toggle" aria-expanded={panel === 'how'} aria-controls={`${ids}-panel`} onClick={() => toggle('how')}>
              How to play
            </button>
          )}
        </div>
      </section>

      <div id={`${ids}-panel`} className="home__panel" data-panel={panel} hidden={panel === 'none'}>
        {panel === 'confirm' && (
          <div className="home__confirm" role="alertdialog" aria-labelledby={`${ids}-confirm`}>
            <p id={`${ids}-confirm`}>Starting a new run replaces your saved run.</p>
            <button type="button" className="btn btn--play" onClick={() => onNewRun(null)}>
              Start new run
            </button>
            <button type="button" className="btn" onClick={() => setPanel('none')}>
              Keep saved run
            </button>
          </div>
        )}
        {panel === 'seed' && (
          <form className="home__seed" onSubmit={startSeeded}>
            <label htmlFor={`${ids}-seed`}>Seed</label>
            <input
              id={`${ids}-seed`}
              className="home__seed-input"
              inputMode="numeric"
              autoComplete="off"
              value={seedText}
              aria-invalid={seedError !== null}
              aria-describedby={`${ids}-seed-note`}
              onChange={(e) => {
                setSeedText(e.target.value);
                setSeedError(null);
              }}
            />
            <button type="submit" className="btn btn--play">
              Start seeded run
            </button>
            <p id={`${ids}-seed-note`} className={seedError === null ? 'home__note' : 'home__note home__note--error'}>
              {seedError ?? `The same seed deals the same run.${savedRun === null ? '' : ' This replaces your saved run.'}`}
            </p>
          </form>
        )}
        {panel === 'how' && HowToPlay !== null && (
          <div className="home__how">
            <HowToPlay />
          </div>
        )}
      </div>

      {others.length > 0 && (
        <section className="home__more" aria-labelledby={`${ids}-more`}>
          <h2 id={`${ids}-more`} className="home__more-heading">
            More games
          </h2>
          <ul className="home__more-list">
            {others.map((game) => (
              <li key={game.id}>
                <button type="button" className="home__game" data-game={game.id} data-listing={game.listing} data-accent={game.accent} onClick={() => onPlay(game)}>
                  <span className="home__game-title">{gameLabel(game)}</span>
                  <span className="home__game-tagline">{game.tagline}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** A game's name as More games lists it. */
export function gameLabel(game: BrowserGame): string {
  switch (game.listing) {
    case 'prototype':
      return `Prototype: ${game.title}`;
    case 'dev':
      return `Dev: ${game.title}`;
    case 'featured':
      return game.title;
  }
}
