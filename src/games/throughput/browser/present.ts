import type { CardView } from '../../../ui/types';
import { CATEGORIES, cardEffect, designAdd, formatAmount, makeUnits, shipCap } from '../model';
import type { Card, CardDef, Category, FixtureDef, TrendStage } from '../model';
import type { Offer, ShiftResult, ThroughputRun } from '../rules';

/** Department colour per Category (keys from ui/theme/tokens.css). */
export const CATEGORY_ACCENT: Readonly<Record<Category, string>> = { Apparel: 'violet', Gadgets: 'blue', Home: 'orange', Food: 'green' };

export const STAGE_NAME: Readonly<Record<TrendStage, string>> = { hot: 'Hot', emerging: 'Emerging', saturated: 'Saturated', neutral: 'Neutral' };

const STAGE_LABEL = { design: 'Design', make: 'Make', ship: 'Ship' } as const;

/**
 * The big number on the box: Margin for a Design, Units for a Make, capacity for a Ship. A Ship
 * that sells up to Demand shows the Demand left when known ("≤12"), else "≤D".
 */
function valueLabel(card: Card, demandLeft?: Readonly<Record<Category, number>>): string {
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
      if (cap === 'demand') return `≤${demandLeft?.[card.category] ?? 'D'}`;
      return cap === 'all' ? 'All' : String(cap);
    }
  }
}

/** `demandLeft` (during a Shift) lets a Demand-capped Ship show how much it can still sell. */
export function cardView(card: Card, id = `card-${card.uid}`, demandLeft?: Readonly<Record<Category, number>>): CardView {
  const extras = [card.upgrades > 0 ? `Tooled ×${card.upgrades}` : '', card.growth > 0 ? `R&D +$${card.growth}` : ''].filter(Boolean);
  return {
    id,
    title: card.def.name,
    description: cardEffect(card).replace(/^\w+: /, ''),
    tags: [card.category, STAGE_LABEL[card.def.stage], ...extras],
    accent: CATEGORY_ACCENT[card.category],
    valueLabel: valueLabel(card, demandLeft),
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

/** One Category's Demand as the Market shows it. */
export type DemandView = {
  readonly category: Category;
  /** Units it still buys this round (in the shop: all of next round's Demand). */
  readonly left: number;
  /** The bar's full width: Demand at the start of the round, after any Saturated halving. */
  readonly full: number;
  /** Units the current Line would sell into it this Shift. */
  readonly using: number;
  /** Saturated this round (in the shop: next round), so its Demand is halved. */
  readonly halved: boolean;
  /** Permanent Demand already earned this round; it counts from next round. */
  readonly earned: number;
  /** Permanent Demand running the current Line would earn. */
  readonly wouldEarn: number;
  /** Running the current Line would sell it out. */
  readonly sellsOut: boolean;
  readonly scale: number;
  readonly premium: number;
};

/** Demand per Category for the Market: this round's during a Shift (with `preview`'s use), next round's in the shop. */
export function demandViews(run: ThroughputRun, preview: ShiftResult | null): DemandView[] {
  const next = run.round + 1;
  return CATEGORIES.map((category) => {
    const { scale, premium } = run.grants[category];
    if (run.phase !== 'shift') {
      const full = next <= run.rounds ? run.demandIn(next, category) : run.demand[category];
      const halved = run.trends[next - 1]?.[category] === 'saturated';
      return { category, left: full, full, using: 0, halved, earned: 0, wouldEarn: 0, sellsOut: false, scale, premium };
    }
    return {
      category,
      left: run.demandLeft[category],
      full: run.roundDemand[category],
      using: preview?.demandSold[category] ?? 0,
      halved: run.trendsNow[category] === 'saturated',
      earned: run.demandEarned[category],
      wouldEarn: preview?.demandGrowth[category] ?? 0,
      sellsOut: preview?.soldOut.includes(category) ?? false,
      scale,
      premium,
    };
  });
}
