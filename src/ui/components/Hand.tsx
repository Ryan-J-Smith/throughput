import type { CardView, HandSort } from '../types';
import { Card } from './Card';

const SORT_OPTIONS: readonly { sort: HandSort; label: string }[] = [
  { sort: 'value', label: 'Sort by value' },
  { sort: 'group', label: 'Sort by group' },
];

export type HandProps = {
  cards: readonly CardView[];
  selectedIds: readonly string[];
  maxSelected: number;
  canPlay: boolean;
  canDiscard: boolean;
  /** Freeze selection (e.g. while a tally plays). */
  locked?: boolean;
  /** When `onSortChange` is provided, renders Sort by value / Sort by group toggles. */
  sort?: HandSort;
  onSortChange?: (sort: HandSort) => void;
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
  sort = 'dealt',
  onSortChange,
  onToggleSelect,
  onPlay,
  onDiscard,
}: HandProps) {
  const atCapacity = selectedIds.length >= maxSelected;

  return (
    <section className="hand" aria-label="Hand">
      {onSortChange && (
        <div className="hand__sort" role="group" aria-label="Sort hand">
          {SORT_OPTIONS.map(({ sort: option, label }) => (
            <button
              key={option}
              type="button"
              className="hand__sort-button"
              aria-pressed={sort === option}
              onClick={() => onSortChange(sort === option ? 'dealt' : option)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
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
