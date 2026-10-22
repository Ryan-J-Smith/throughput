import type { BrowserGame } from '../games';

export type GamePickerProps = {
  games: readonly BrowserGame[];
  /** A short description of the game's autosaved run, or null if it has none. */
  savedRun?: (game: BrowserGame) => string | null;
  onPick: (game: BrowserGame) => void;
  onContinue?: (game: BrowserGame) => void;
};

/** Title screen with every registered game shown as a boxed product to pick from. */
export function GamePicker({ games, savedRun = () => null, onPick, onContinue }: GamePickerProps) {
  return (
    <main className="screen screen--title screen--picker">
      <div className="title-box" data-accent="red">
        <div className="title-box__band" aria-hidden="true" />
        <h1 className="title-logo">
          <span>Shelf</span>
          <span>Life</span>
        </h1>
        <p className="title-tagline">Make things. Price them. Ship them before the quarter closes.</p>
        <div className="title-box__footer" aria-hidden="true">
          <span className="title-box__barcode" />
          <span className="title-box__small">Contents: one company. Best before the market turns.</span>
        </div>
      </div>
      <section className="picker" aria-labelledby="picker-heading">
        <h2 id="picker-heading" className="section-label">
          Pick a business to run
        </h2>
        <ul className="picker__list">
          {games.map((game) => {
            const saved = savedRun(game);
            return (
              <li key={game.id}>
                <button type="button" className="picker__item" data-accent={game.accent} onClick={() => onPick(game)}>
                  <span className="picker__band" aria-hidden="true" />
                  <span className="picker__title">{game.title}</span>
                  <span className="picker__tagline">{game.tagline}</span>
                  <span className="picker__play">{saved === null ? 'Play' : 'New run'}</span>
                </button>
                {saved !== null && onContinue !== undefined && (
                  <button type="button" className="picker__continue" data-accent={game.accent} onClick={() => onContinue(game)}>
                    <span className="picker__continue-label">Continue run</span>
                    <span className="picker__continue-detail">{saved}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
