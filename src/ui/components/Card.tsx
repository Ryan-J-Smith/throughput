import type { ReactNode } from 'react';
import type { CardView, Rarity } from '../types';
import { Tooltip } from './Tooltip';

export type CardProps = {
  card: CardView;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  rarity?: Rarity;
  onClick?: () => void;
  footer?: ReactNode;
};

export function Card({ card, selected = false, disabled = false, compact = false, rarity, onClick, footer }: CardProps) {
  const isDisabled = disabled || card.disabled === true;
  const className = [
    'card',
    compact && 'card--compact',
    rarity && `card--rarity-${rarity}`,
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

  const face = onClick ? (
    <button type="button" className={className} aria-pressed={selected} disabled={isDisabled} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );

  return (
    <div className="card-wrap">
      {card.tooltip ? <Tooltip tooltip={card.tooltip}>{face}</Tooltip> : face}
      {footer}
    </div>
  );
}
