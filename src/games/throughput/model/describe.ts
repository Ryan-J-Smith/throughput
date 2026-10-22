import { formatAmount } from './batch';
import { CATEGORY_CODE } from './types';
import type { Card } from './types';

const STAGE_LABEL = { design: 'Design', make: 'Make', ship: 'Ship' } as const;

/** Short name with the Category code, e.g. "Sketch-G". */
export function cardName(card: Card): string {
  return `${card.def.name}-${CATEGORY_CODE[card.category]}`;
}

/** Margin a Design adds before any multiplier: its own bonus plus upgrades and R&D growth. */
export function designAdd(card: Card): number {
  return card.def.stage === 'design' ? card.def.marginAdd + card.upgrades + card.growth : 0;
}

/** Units a Make card adds, including Tooling Upgrades. */
export function makeUnits(card: Card): number {
  return card.def.stage === 'make' ? card.def.units + 3 * card.upgrades : 0;
}

/** A Ship card's capacity before cap cuts, including Tooling Upgrades (numeric caps only). */
export function shipCap(card: Card): number | 'demand' | 'all' {
  if (card.def.stage !== 'ship') return 0;
  return typeof card.def.cap === 'number' ? card.def.cap + 5 * card.upgrades : card.def.cap;
}

/** What the card does with its current upgrades, e.g. "Design: +$5 Margin". */
export function cardEffect(card: Card): string {
  const def = card.def;
  switch (def.stage) {
    case 'design': {
      const add = designAdd(card);
      const parts = [add !== 0 ? `${add < 0 ? '-' : '+'}$${formatAmount(Math.abs(add))} Margin` : '', def.marginMul !== 1 ? `Margin ×${formatAmount(def.marginMul)}` : ''];
      return `${STAGE_LABEL.design}: ${parts.filter(Boolean).join(', then ') || 'no effect'}`;
    }
    case 'make':
      return `${STAGE_LABEL.make}: +${makeUnits(card)} Units${def.marginAdd !== 0 ? `, ${def.marginAdd < 0 ? '-' : '+'}$${Math.abs(def.marginAdd)} Margin` : ''}`;
    case 'ship': {
      const cap = shipCap(card);
      const at = def.marginMul === 1 ? '' : def.marginMul === 0.5 ? ' at half Margin' : ` at Margin ×${formatAmount(def.marginMul)}`;
      const amount = cap === 'all' ? 'all Units' : cap === 'demand' ? "up to its Category's Demand" : `up to ${cap} Units`;
      return `${STAGE_LABEL.ship}: sell ${amount}${at}${cap === 'all' ? ' (ignores Demand and cap cuts)' : ''}`;
    }
  }
}
