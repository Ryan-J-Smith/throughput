import type { ModifierRowView } from '../types';
import { Card } from './Card';

export type ModifierRowProps = {
  row: ModifierRowView;
};

export function ModifierRow({ row }: ModifierRowProps) {
  const emptySlots = Math.max(0, row.slots - row.modifiers.length);

  return (
    <section className="modifier-row" aria-label="Owned modifiers">
      <div className="modifier-row__header">
        <span className="section-label">Modifiers</span>
        <span className="modifier-row__count">
          {row.modifiers.length}/{row.slots}
        </span>
      </div>
      <div className="modifier-row__slots">
        {row.modifiers.map((modifier) => (
          <Card key={modifier.id} card={modifier} compact />
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <div key={`empty-${i}`} className="modifier-row__empty" aria-label="Empty slot" />
        ))}
      </div>
    </section>
  );
}
