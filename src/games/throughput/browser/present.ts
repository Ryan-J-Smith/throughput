import type { CardView } from '../../../ui/types';
import { cardEffect, designAdd, formatAmount, makeUnits, shipCap } from '../model';
import type { Card, CardDef, Category, FixtureDef, TrendStage } from '../model';
import type { Offer, ThroughputRun } from '../rules';

/** Department colour per Category (keys from ui/theme/tokens.css). */
export const CATEGORY_ACCENT: Readonly<Record<Category, string>> = { Apparel: 'violet', Gadgets: 'blue', Home: 'orange', Food: 'green' };

export const STAGE_NAME: Readonly<Record<TrendStage, string>> = { hot: 'Hot', emerging: 'Emerging', saturated: 'Saturated', neutral: 'Neutral' };

const STAGE_LABEL = { design: 'Design', make: 'Make', ship: 'Ship' } as const;

/** The big number on the box: Margin for a Design, Units for a Make, capacity for a Ship. */
function valueLabel(card: Card): string {
  const def = card.def;
  switch (def.stage) {
    case 'design': {
      const add = designAdd(card);
      return add !== 0 ? `+$${formatAmount(add)}` : `×${formatAmount(def.marginMul)}`;
    }
    case 'make':
      return `+${makeUnits(card)}`;
    case 'ship': {
      const cap = shipCap(card);
      return cap === 'all' ? 'All' : String(cap);
    }
  }
}

export function cardView(card: Card, id = `card-${card.uid}`): CardView {
  const extras = [card.upgrades > 0 ? `Tooled ×${card.upgrades}` : '', card.growth > 0 ? `R&D +$${card.growth}` : ''].filter(Boolean);
  return {
    id,
    title: card.def.name,
    description: cardEffect(card).replace(/^\w+: /, ''),
    tags: [card.category, STAGE_LABEL[card.def.stage], ...extras],
    accent: CATEGORY_ACCENT[card.category],
    valueLabel: valueLabel(card),
  };
}

/** A shop card shown before it exists in the deck. */
export function cardDefView(def: CardDef, category: Category, id: string): CardView {
  return cardView({ uid: -1, def, category, paid: 0, upgrades: 0, growth: 0 }, id);
}

export function fixtureView(def: FixtureDef, id: string): CardView {
  return {
    id,
    title: def.name,
    description: def.text.replace(/^Station\. /, ''),
    tags: [def.kind === 'station' ? 'Station' : 'Mod'],
    accent: def.kind === 'station' ? 'mustard' : 'teal',
  };
}

/**
 * What a boss is doing to the Line's Fixtures, for a notice above the bays: the moves before this
 * Shift (or that they start next Shift), or in the shop a warning about next round's boss.
 */
export function lineNotice(run: ThroughputRun): string | null {
  const recall = 'Tap a parked card to take it back to your hand.';
  if (run.phase === 'shift') {
    const boss = run.boss;
    if (boss === null || !boss.movesFixtures()) return null;
    if (run.fixtureMoves.length === 0) return `${boss.name}: from Shift 2, your Fixtures move one bay right before each Shift. ${boss.recallsParked() ? recall : ''}`.trim();
    const moves = run.fixtureMoves.map((m) => `${m.fixture.def.name} ${m.from + 1}→${m.to + 1}`).join(', ');
    return `${boss.name} moved your Fixtures before this Shift: ${moves}. Cards stay put. ${boss.recallsParked() ? recall : ''}`.trim();
  }
  const boss = run.phase === 'shop' ? run.bossOf(run.round + 1) : null;
  if (boss === null || !boss.movesFixtures()) return null;
  return `Next round, ${boss.name} moves your Fixtures one bay right before each Shift from Shift 2 on. Your layout comes back after the round.`;
}

export function offerView(offer: Offer, id: string): CardView {
  switch (offer.kind) {
    case 'fixture':
      return fixtureView(offer.def, id);
    case 'card':
      return cardDefView(offer.def, offer.category, id);
    case 'contract':
      return { id, title: offer.def.name, description: offer.def.text, tags: ['Contract'], accent: 'red' };
  }
}

/** Where an unfinished run stands, for the title's Continue button, e.g. "Year 2 Q1, Shift 3: $410 of $900". */
export function runProgressLabel(run: ThroughputRun): string {
  const inShop = run.phase === 'shop';
  const q = run.quarterOf(inShop ? run.round + 1 : run.round);
  const quarter = `Year ${q.year} ${q.isBoard ? 'Board' : `Q${q.quarter}`}`;
  return inShop ? `${quarter}, in the shop` : `${quarter}, Shift ${run.shift}: $${run.sales} of $${run.target}`;
}
