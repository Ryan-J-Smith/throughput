import { useState } from 'react';
import { Card } from '../../../ui/components';
import { Icon } from '../../../ui/icons';
import { fixtureText } from '../cli';
import { cardName } from '../model';
import type { ThroughputRun } from '../rules';
import { fixtureArt } from './art';
import { cardView, lineNotice, plateText } from './present';

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
  /** While a hand card is dragged: true for bays it can be dropped on (they highlight as it passes over). */
  canDrop?: (slot: number) => boolean;
  /** A dragged hand card dropped on a bay that `canDrop` accepts. */
  onDropCard?: (slot: number) => void;
};

/**
 * The factory Line as a conveyor of bays, left to right. Each bay shows its Fixture plate and
 * the card loaded there; the Batch runs in that order.
 */
export function LineView({ run, bayState, onBay, onScrap, bayLabel, canDrop, onDropCard }: LineViewProps) {
  /** The bay a dragged card is over, if it can be dropped there. */
  const [over, setOver] = useState<number | null>(null);
  const inShift = run.phase === 'shift';
  const notice = lineNotice(run);
  const movedFrom = new Map(inShift ? run.fixtureMoves.map((m) => [m.to, m.from]) : []);
  return (
    <section className="tp-line" aria-label="Line">
      {notice !== null && <p className="tp-line__notice">{notice}</p>}
      <ol className="tp-line__bays">
        {run.line.map((slot, i) => {
          const welded = inShift && run.isWelded(i);
          const station = slot.fixture?.def.kind === 'station';
          const held = slot.card;
          const parked = held !== null && held.loadedShift < run.shift;
          // A Mod under a card it never acts on (Quality Lab under a Truck).
          const idle = held !== null && slot.fixture !== null && !welded && !slot.fixture.def.effect.appliesTo(held.card);
          const from = movedFrom.get(i);
          const state = bayState(i);
          // Between rounds only bays that hold a Fixture (to move or sell) or accept one can be tapped.
          const inert = !inShift && state === 'idle' && slot.fixture === null;
          const classes = ['tp-bay', `tp-bay--${state}`, welded && 'tp-bay--welded', station && 'tp-bay--station', parked && 'tp-bay--parked', canDrop !== undefined && over === i && 'tp-bay--dragover']
            .filter(Boolean)
            .join(' ');
          const art = slot.fixture === null || welded ? undefined : fixtureArt(slot.fixture.def.id);
          return (
            <li
              key={i}
              className={classes}
              data-slot={i + 1}
              data-fixture={slot.fixture?.def.id}
              data-kind={slot.fixture?.def.kind}
              onDragOver={(event) => {
                if (canDrop?.(i) !== true) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOver(i);
              }}
              onDragLeave={(event) => {
                if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setOver(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                if (canDrop?.(i) === true) onDropCard?.(i);
              }}
            >
              <div
                className={`tp-bay__plate ${idle ? 'is-idle' : ''}`}
                data-accent={slot.fixture === null ? undefined : station ? 'mustard' : 'teal'}
                title={slot.fixture === null || welded ? undefined : fixtureText(slot.fixture)}
              >
                {slot.fixture !== null && !welded && (
                  <span className={`tp-bay__fixture-art ${art === undefined ? 'tp-bay__fixture-art--icon' : ''}`} aria-hidden="true">
                    {art !== undefined ? <img src={art} alt="" loading="lazy" /> : <Icon name={station ? 'station' : 'mod'} />}
                  </span>
                )}
                <span className="tp-bay__number">
                  {i + 1}
                  {from !== undefined && <span className="tp-bay__moved"> moved from bay {from + 1}</span>}
                </span>
                <span className="tp-bay__fixture">{welded ? 'Welded shut' : (slot.fixture?.def.name ?? 'No fixture')}</span>
                {slot.fixture !== null && !welded && (
                  <span className="tp-bay__fixture-text">{plateText(slot.fixture)}</span>
                )}
                {idle && (
                  <span className="tp-bay__idle" title="Idle for this card">
                    Idle
                  </span>
                )}
              </div>
              <button type="button" className="tp-bay__spot" aria-label={bayLabel(i)} onClick={() => onBay(i)} disabled={inert}>
                {held !== null ? (
                  <Card card={cardView(held.card, undefined, run.demandLeft)} />
                ) : (
                  <span className="tp-bay__empty">{welded ? '' : station ? slot.fixture?.def.name : inShift ? 'Empty' : ''}</span>
                )}
              </button>
              {held !== null && inShift && (
                <span className={`tp-bay__status ${parked ? 'is-parked' : 'is-new'}`} title={statusHelp(parked, run.staysAfterShift(i))}>
                  {parked
                    ? `Parked since Shift ${held.loadedShift}${run.whyCannotUnload([i]) === null ? ', tap to take back' : ''}`
                    : run.staysAfterShift(i)
                      ? 'Loaded, stays for later Shifts'
                      : 'Loaded, used up this Shift'}
                </span>
              )}
              {parked && onScrap !== undefined && held !== null && (
                <button
                  type="button"
                  className="tp-bay__scrap"
                  aria-label={`Scrap ${cardName(held.card)} from bay ${i + 1}`}
                  title="Discard this parked card to free the bay. It goes to your discard pile, not out of your deck."
                  onClick={() => onScrap(i)}
                >
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

/** What happens to a loaded card when the Shift runs, for its status line's tooltip. */
function statusHelp(parked: boolean, stays: boolean): string {
  if (parked) return 'Stays on the Line for the rest of the round, adding its effect to every Shift.';
  return stays ? 'Stays on the Line after this Shift runs, adding its effect to each later Shift this round.' : 'Goes to your discard pile when this Shift runs.';
}
