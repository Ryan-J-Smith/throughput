import { Card } from '../../../ui/components';
import type { Part } from '../model';
import type { BomRun } from '../rules';
import { partKey, partView } from './present';

export type BenchTrayProps = {
  run: BomRun;
  selection: readonly Part[];
  /** Set while a Fabricate waits for the Bench part to trash. */
  trashable: ReadonlySet<Part> | null;
  /** Omitted between rounds: the Bench is shown but can't be used. */
  onTap?: (part: Part) => void;
};

/** The Bench: fabricated parts that wait outside the hand and carry over between rounds. */
export function BenchTray({ run, selection, trashable, onTap }: BenchTrayProps) {
  const slots = run.mods.benchSlots;
  const empty = Math.max(0, slots - run.bench.length);
  return (
    <section className={`bom-bench ${trashable !== null ? 'is-trashing' : ''}`} aria-label="Bench">
      <header className="bom-bench__head">
        <h2 className="bom-bench__title">Bench</h2>
        <span className="bom-bench__count">
          {run.bench.length}/{slots}
        </span>
        <span className="bom-bench__note">{trashable !== null ? 'Tap a part to trash it' : 'Carries over between rounds'}</span>
      </header>
      <div className="bom-bench__slots">
        {run.bench.map((part) => {
          const canTrash = trashable?.has(part) === true;
          return (
            <div key={partKey(part)} className={`bom-bench__slot ${canTrash ? 'is-trashable' : ''}`}>
              <Card
                card={partView(part, partKey(part))}
                selected={selection.includes(part)}
                onClick={onTap === undefined || (trashable !== null && !canTrash) ? undefined : () => onTap(part)}
              />
            </div>
          );
        })}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`empty-${i}`} className="bom-bench__slot bom-bench__slot--empty">
            <span>Empty slot</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export type PartsHandProps = {
  /** In display order (by category, grade high to low). */
  hand: readonly Part[];
  selection: readonly Part[];
  onTap: (part: Part) => void;
  disabled: boolean;
};

export function PartsHand({ hand, selection, onTap, disabled }: PartsHandProps) {
  return (
    <div className="hand__cards">
      {hand.map((part, i) => (
        <Card key={partKey(part)} card={partView(part, partKey(part))} index={i} selected={selection.includes(part)} disabled={disabled} onClick={() => onTap(part)} />
      ))}
    </div>
  );
}
