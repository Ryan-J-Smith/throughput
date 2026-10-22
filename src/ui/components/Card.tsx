import type { CSSProperties, ReactNode } from 'react';
import type { CardView, Rarity } from '../types';
import { Tooltip } from './Tooltip';

export type CardProps = {
  card: CardView;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  rarity?: Rarity;
  /** Position in its row, used to stagger entrance animations. */
  index?: number;
  onClick?: () => void;
  footer?: ReactNode;
};

/**
 * A card printed like product packaging: a department band (first tag, coloured by `accent`),
 * the name, the value as a big model number, the blurb, and remaining tags as stamps.
 */
export function Card({ card, selected = false, disabled = false, compact = false, rarity, index, onClick, footer }: CardProps) {
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
  const [department, ...stamps] = card.tags;
  const style = index === undefined ? undefined : ({ '--i': index } as CSSProperties);

  const body = (
    <>
      <div className="card__band">
        <span className="card__dept">{department ?? ''}</span>
        {card.cost !== undefined && <span className="badge badge--cost">${card.cost}</span>}
      </div>
      <div className="card__title">{card.title}</div>
      {card.value !== undefined && <span className="badge badge--value">+{card.value}</span>}
      <p className="card__desc">{card.description}</p>
      {stamps.length > 0 && (
        <ul className="card__tags">
          {stamps.map((tag) => (
            <li key={tag} className="chip">
              {tag}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const face = onClick ? (
    <button
      type="button"
      className={className}
      data-accent={card.accent ?? 'neutral'}
      aria-pressed={selected}
      disabled={isDisabled}
      onClick={onClick}
    >
      {body}
    </button>
  ) : (
    <div className={className} data-accent={card.accent ?? 'neutral'}>
      {body}
    </div>
  );

  return (
    <div className="card-wrap" style={style}>
      {card.tooltip ? <Tooltip tooltip={card.tooltip}>{face}</Tooltip> : face}
      {footer}
    </div>
  );
}
