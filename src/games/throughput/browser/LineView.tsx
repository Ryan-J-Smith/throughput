import { Card } from '../../../ui/components';
import type { ThroughputRun } from '../rules';
import { cardView } from './present';

export type BayState = 'target' | 'selected' | 'idle';

export type LineViewProps = {
  run: ThroughputRun;
  /** How each bay should look for the current interaction (e.g. highlight valid drop targets). */
  bayState: (slot: number) => BayState;
  onBay: (slot: number) => void;
  /** Shown under parked cards during a Shift. */
  onScrap?: (slot: number) => void;
  /** Label for the bay button, for screen readers. */
  bayLabel: (slot: number) => string;
};

/**
 * The factory Line as a conveyor of bays, left to right. Each bay shows its Fixture plate and
 * the card loaded there; the Batch runs in that order.
 */
export function LineView({ run, bayState, onBay, onScrap, bayLabel }: LineViewProps) {
  const inShift = run.phase === 'shift';
  return (
    <section className="tp-line" aria-label="Line">
      <ol className="tp-line__bays">
        {run.line.map((slot, i) => {
          const welded = inShift && run.isWelded(i);
          const station = slot.fixture?.def.kind === 'station';
          const held = slot.card;
          const parked = held !== null && held.loadedShift < run.shift;
          const state = bayState(i);
          // Between rounds only bays that hold a Fixture (to move or sell) or accept one can be tapped.
          const inert = !inShift && state === 'idle' && slot.fixture === null;
          const classes = ['tp-bay', `tp-bay--${state}`, welded && 'tp-bay--welded', station && 'tp-bay--station', parked && 'tp-bay--parked']
            .filter(Boolean)
            .join(' ');
          return (
            <li key={i} className={classes}>
              <div className="tp-bay__plate" data-accent={slot.fixture === null ? undefined : station ? 'mustard' : 'teal'}>
                <span className="tp-bay__number">{i + 1}</span>
                <span className="tp-bay__fixture">{welded ? 'Welded shut' : (slot.fixture?.def.name ?? 'No fixture')}</span>
                {slot.fixture !== null && !welded && <span className="tp-bay__fixture-text">{slot.fixture.def.text.replace(/^Station\. /, '')}</span>}
              </div>
              <button type="button" className="tp-bay__spot" aria-label={bayLabel(i)} onClick={() => onBay(i)} disabled={inert}>
                {held !== null ? (
                  <Card card={cardView(held.card)} />
                ) : (
                  <span className="tp-bay__empty">{welded ? '' : station ? slot.fixture?.def.name : inShift ? 'Empty' : ''}</span>
                )}
              </button>
              {held !== null && inShift && (
                <span className={`tp-bay__status ${parked ? 'is-parked' : 'is-new'}`}>{parked ? `Parked since Shift ${held.loadedShift}` : 'Loaded'}</span>
              )}
              {parked && onScrap !== undefined && (
                <button type="button" className="tp-bay__scrap" onClick={() => onScrap(i)}>
                  Scrap
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
