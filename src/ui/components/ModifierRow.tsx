import { useState } from 'react';
import type { DragEvent } from 'react';
import type { ModifierRowView, ModifierView } from '../types';
import { Card } from './Card';

export type ModifierRowProps = {
  row: ModifierRowView;
  /** When provided, each modifier gets a Sell button. */
  onSell?: (modifierId: string) => void;
  /** When provided, modifiers can be dragged (desktop) or nudged with arrow buttons (touch, keyboard). */
  onMove?: (modifierId: string, toIndex: number) => void;
};

export function ModifierRow({ row, onSell, onMove }: ModifierRowProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const emptySlots = Math.max(0, row.slots - row.modifiers.length);
  const last = row.modifiers.length - 1;
  const canDrag = onMove !== undefined && !row.locked && row.modifiers.length > 1;

  const endDrag = () => {
    setDragId(null);
    setOverIndex(null);
  };

  // Empty slots count as the last position.
  const dropHandlers = (index: number) => ({
    onDragOver: (e: DragEvent) => {
      if (dragId === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOverIndex(Math.min(index, last));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const from = row.modifiers.findIndex((m) => m.id === dragId);
      const to = Math.min(index, last);
      if (dragId !== null && from !== to) onMove?.(dragId, to);
      endDrag();
    },
  });

  const controls = (modifier: ModifierView, index: number) => {
    if (!onSell && !onMove) return undefined;
    return (
      <div className="modifier-actions">
        {onMove && (
          <button
            type="button"
            className="modifier-actions__nudge"
            aria-label={`Move ${modifier.title} left`}
            disabled={row.locked || index === 0}
            onClick={() => onMove(modifier.id, index - 1)}
          >
            ◀
          </button>
        )}
        {onSell && (
          <button
            type="button"
            className={`modifier-actions__sell ${modifier.canSell ? '' : 'btn--unaffordable'}`}
            disabled={row.locked}
            onClick={() => onSell(modifier.id)}
          >
            Sell ${modifier.sellValue}
          </button>
        )}
        {onMove && (
          <button
            type="button"
            className="modifier-actions__nudge"
            aria-label={`Move ${modifier.title} right`}
            disabled={row.locked || index === last}
            onClick={() => onMove(modifier.id, index + 1)}
          >
            ▶
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="modifier-row" aria-label="Owned modifiers">
      <div className="modifier-row__header">
        <span className="section-label">Modifiers</span>
        {canDrag && <span className="modifier-row__hint">Drag to reorder · applied left to right</span>}
        <span className="modifier-row__count">
          {row.modifiers.length}/{row.slots}
        </span>
      </div>
      <div className="modifier-row__slots">
        {row.modifiers.map((modifier, index) => {
          const className = [
            'modifier-slot',
            canDrag && 'modifier-slot--draggable',
            dragId === modifier.id && 'modifier-slot--dragging',
            dragId !== null && dragId !== modifier.id && overIndex === index && 'modifier-slot--drop-target',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={modifier.id}
              className={className}
              draggable={canDrag}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', modifier.id);
                setDragId(modifier.id);
              }}
              onDragEnd={endDrag}
              {...dropHandlers(index)}
            >
              <Card card={modifier} compact footer={controls(modifier, index)} />
            </div>
          );
        })}
        {Array.from({ length: emptySlots }, (_, i) => (
          <div
            key={`empty-${i}`}
            className="modifier-row__empty"
            aria-label="Empty slot"
            {...dropHandlers(row.modifiers.length + i)}
          />
        ))}
      </div>
    </section>
  );
}
