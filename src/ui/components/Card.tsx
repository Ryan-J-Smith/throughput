import type { ReactNode } from 'react';
import type { CardView } from '../types';

export type CardProps = {
  card: CardView;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onClick?: () => void;
  footer?: ReactNode;
};

export function Card({ card, selected = false, disabled = false, compact = false, onClick, footer }: CardProps) {
  const isDisabled = disabled || card.disabled === true;
  const className = [
    'card',
    compact && 'card--compact',
    selected && 'card--selected',
    isDisabled && 'card--disabled',
    onClick && !isDisabled && 'card--interactive',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      {(card.cost !== undefined || card.value !== undefined) && (
        <div className="card__badges">
          {card.cost !== undefined && <span className="badge badge--cost">${card.cost}</span>}
          {card.value !== undefined && <span className="badge badge--value">+{card.value}</span>}
        </div>
      )}
      <div className="card__title">{card.title}</div>
      {card.tags.length > 0 && (
        <ul className="card__tags">
          {card.tags.map((tag) => (
            <li key={tag} className="chip">
              {tag}
            </li>
          ))}
        </ul>
      )}
      <p className="card__desc">{card.description}</p>
    </>
  );

  if (onClick) {
    return (
      <div className="card-wrap">
        <button type="button" className={className} aria-pressed={selected} disabled={isDisabled} onClick={onClick}>
          {body}
        </button>
        {footer}
      </div>
    );
  }
  return (
    <div className="card-wrap">
      <div className={className}>{body}</div>
      {footer}
    </div>
  );
}
