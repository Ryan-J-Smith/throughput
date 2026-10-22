import type { CardView } from '../types';
import { Card } from './Card';

export type HandProps = {
  cards: readonly CardView[];
  selectedIds: readonly string[];
  maxSelected: number;
  canPlay: boolean;
  canDiscard: boolean;
  /** Freeze selection (e.g. while a tally plays). */
  locked?: boolean;
  onToggleSelect: (cardId: string) => void;
  onPlay: () => void;
  onDiscard: () => void;
};

export function Hand({
  cards,
  selectedIds,
  maxSelected,
  canPlay,
  canDiscard,
  locked = false,
  onToggleSelect,
  onPlay,
  onDiscard,
}: HandProps) {
  const atCapacity = selectedIds.length >= maxSelected;

  return (
    <section className="hand" aria-label="Hand">
      <div className="hand__cards">
        {cards.map((card) => {
          const selected = selectedIds.includes(card.id);
          return (
            <Card
              key={card.id}
              card={card}
              selected={selected}
              disabled={locked || (!selected && atCapacity)}
              onClick={() => onToggleSelect(card.id)}
            />
          );
        })}
      </div>
      <div className="hand__controls">
        <button type="button" className="btn btn--play" disabled={!canPlay} onClick={onPlay}>
          Play
        </button>
        <span className="hand__count">
          {selectedIds.length}/{maxSelected} selected
        </span>
        <button type="button" className="btn btn--discard" disabled={!canDiscard} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </section>
  );
}
