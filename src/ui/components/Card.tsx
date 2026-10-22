import { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../icons';
import type { CardView, Rarity } from '../types';
import { Tooltip } from './Tooltip';
import { useFitText } from './useFitText';

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
 * the name, the value as a big model number, the blurb, and remaining tags as stamps. With art
 * (or an icon) the box gets a window under the band and the value sits on it as a sticker.
 * Where the CSS gives the card a fixed template, the title and blurb step their type down to fit
 * their boxes and, failing that, clamp with the full text in a tooltip (see useFitText).
 */
export function Card({ card, selected = false, disabled = false, compact = false, rarity, index, onClick, footer }: CardProps) {
  const isDisabled = disabled || card.disabled === true;
  const windowed = !compact && (card.art !== undefined || card.icon !== undefined);
  const className = [
    'card',
    compact && 'card--compact',
    windowed && 'card--windowed',
    rarity && `card--rarity-${rarity}`,
    selected && 'card--selected',
    isDisabled && 'card--disabled',
    onClick && !isDisabled && 'card--interactive',
  ]
    .filter(Boolean)
    .join(' ');
  const [department, ...stamps] = card.tags;
  const titleRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  useFitText(titleRef, card.title, 3);
  useFitText(descRef, card.description, 2);
  const style = index === undefined ? undefined : ({ '--i': index } as CSSProperties);

  const valueText = card.valueLabel ?? (card.value !== undefined ? `+${card.value}` : undefined);
  const value = valueText !== undefined && <span className="badge badge--value">{valueText}</span>;

  const body = (
    <>
      <div className="card__band">
        <span className="card__dept">
          {card.icon !== undefined && <Icon name={card.icon} className="card__dept-icon" />}
          {department ?? ''}
        </span>
        {card.cost !== undefined && <span className="badge badge--cost">${card.cost}</span>}
      </div>
      {windowed && (
        <div className={`card__art ${card.art === undefined ? 'card__art--icon' : ''}`}>
          {card.art !== undefined ? (
            <img src={card.art} alt="" loading="lazy" decoding="async" draggable={false} />
          ) : (
            card.icon !== undefined && <Icon name={card.icon} />
          )}
          {value}
        </div>
      )}
      <div className="card__title" ref={titleRef}>
        {card.title}
      </div>
      {!windowed && value}
      <p className="card__desc" ref={descRef}>
        {card.description}
      </p>
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
