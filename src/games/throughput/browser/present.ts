import type { CardView } from '../../../ui/types';
import { fixtureNow } from '../cli';
import { SHOP_CARDS } from '../content';
import type { ThroughputConfig } from '../content';
import { CATEGORIES, cardEffect, designAdd, formatAmount, growthText, makeUnits, repeatRule, shipCap } from '../model';
import type { BoardBoss, Card, CardDef, Category, Fixture, FixtureDef, Stage, TrendStage } from '../model';
import { NO_SHIP_AFTER } from '../rules';
import type { Offer, ShiftResult, ThroughputRun } from '../rules';
import { CATEGORY_ICON, cardArt, contractArt, fixtureArt } from './art';

/** Department colour per Category (keys from ui/theme/tokens.css). */
export const CATEGORY_ACCENT: Readonly<Record<Category, string>> = { Apparel: 'rose', Gadgets: 'cyan', Home: 'amber', Food: 'lime' };

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
      return add !== 0 ? `${add < 0 ? '-' : '+'}$${formatAmount(Math.abs(add))}` : `×${formatAmount(def.marginMul)}`;
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

/** A card's growth as a stamp, short enough for a card's foot (the CLI's growthText says where it grew). */
function growthStamp(card: Card): string {
  if (card.growth <= 0) return '';
  return card.def.stage === 'make' ? `+${card.growth} grown` : growthText(card);
}

/** `demandLeft` (during a Shift) lets a Demand-capped Ship show how much it can still sell. */
export function cardView(card: Card, id = `card-${card.uid}`, demandLeft?: Readonly<Record<Category, number>>): CardView {
  // During a Shift, a Ship says its Category's Demand left, or that it has sold out (short, so the stamp fits one line).
  // A Ship capped at Demand already shows what's left on its badge (≤N), so it stamps only Sold out.
  const cap = card.def.stage === 'ship' ? shipCap(card) : null;
  const left = demandLeft !== undefined && cap !== null && cap !== 'all' ? demandLeft[card.category] : null;
  const demand = left === null ? '' : left === 0 ? 'Sold out' : cap === 'demand' ? '' : `${left} left`;
  const extras = [card.upgrades > 0 ? `Tooled ×${card.upgrades}` : '', growthStamp(card), demand].filter(Boolean);
  return {
    id,
    title: card.def.name,
    description: cardEffect(card).replace(/^\w+: /, ''),
    tags: [card.category, STAGE_LABEL[card.def.stage], ...extras],
    accent: CATEGORY_ACCENT[card.category],
    valueLabel: valueLabel(card, demandLeft),
    ...withArt(cardArt(card.def.id, card.category, card.def.stage)),
    icon: CATEGORY_ICON[card.category],
  };
}

/** `{ art }` when there is an illustration, so CardView never carries `art: undefined`. */
function withArt(art: string | undefined): { art?: string } {
  return art === undefined ? {} : { art };
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
    // "Fixture" is the noun everywhere; Mod and Station are its two kinds.
    tags: [def.kind === 'station' ? 'Fixture · Station' : 'Fixture · Mod'],
    accent: def.kind === 'station' ? 'mustard' : 'teal',
    ...withArt(fixtureArt(def.id)),
    icon: def.kind === 'station' ? 'station' : 'mod',
  };
}

/**
 * What stands in each bay, as the Line draws it: the loaded card, else a Station (which fills its
 * bay), else nothing. The replay puts these faces on the belt, so a Run plays with the real cards.
 */
export function lineFaces(run: ThroughputRun): (CardView | null)[] {
  return run.line.map((slot, i) => {
    if (slot.card !== null) return cardView(slot.card.card, `replay-${i}`, run.demandLeft);
    return slot.fixture?.def.kind === 'station' ? fixtureView(slot.fixture.def, `replay-${i}`) : null;
  });
}

/** A bay plate's text: the Fixture's short gist (or its rule), then what it does now (Flagship's growing ×). */
export function plateText(fixture: Fixture): string {
  return `${fixture.def.short ?? fixture.def.text.replace(/^Station\. /, '')} ${fixtureNow(fixture)}`.trim();
}

/**
 * What a boss is doing to the Line's Fixtures this round, for a notice above the bays: the moves
 * before this Shift, or (with nothing to move) that it moves them. (The shop warns about next
 * round's boss with nextBoardNotice instead.)
 */
export function lineNotice(run: ThroughputRun): string | null {
  const recall = 'Tap a parked card to take it back to your hand.';
  if (run.phase !== 'shift') return null;
  const boss = run.boss;
  if (boss === null || !boss.movesFixtures()) return null;
  if (run.fixtureMoves.length === 0) return `${boss.name}: your Fixtures move one bay right before every Shift. ${boss.recallsParked() ? recall : ''}`.trim();
  const moves = run.fixtureMoves.map((m) => `${m.fixture.def.name} ${m.from + 1}→${m.to + 1}`).join(', ');
  return `${boss.name} moved your Fixtures before this Shift: ${moves}. Cards stay put. ${boss.recallsParked() ? recall : ''}`.trim();
}

/** The shop's heads-up when the next round is a Board Review: its gist to read, its full rule to hover. */
export type NextBoardNotice = { readonly boss: BoardBoss; readonly text: string; readonly help: string };

/** "Y1 Board Review · Short Week: Only 3 Shifts" while shopping before a Board Review; null otherwise. */
export function nextBoardNotice(run: ThroughputRun): NextBoardNotice | null {
  if (run.phase !== 'shop') return null;
  const round = run.round + 1;
  const boss = run.bossOf(round);
  if (boss === null) return null;
  return { boss, text: `Y${run.quarterOf(round).year} Board Review · ${boss.name}: ${boss.short}`, help: `${boss.name}: ${boss.text}` };
}

export function offerView(offer: Offer, id: string): CardView {
  switch (offer.kind) {
    case 'fixture':
      return fixtureView(offer.def, id);
    case 'card':
      return cardDefView(offer.def, offer.category, id);
    case 'contract':
      return { id, title: offer.def.name, description: offer.def.text, tags: ['Contract'], accent: 'red', ...withArt(contractArt(offer.def.id)), icon: 'sales' };
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
  /** A Board boss cutting every Category's Demand that round, e.g. "Recession ×0.5". */
  readonly bossCut: string | null;
  /** Permanent Demand already earned this round; it counts from next round. */
  readonly earned: number;
  /** Permanent Demand running the current Line would earn. */
  readonly wouldEarn: number;
  /** Running the current Line would sell it out. */
  readonly sellsOut: boolean;
  /** The last planned round: growth counts only if the run keeps going past it. */
  readonly ifKeepGoing: boolean;
  readonly scale: number;
  readonly premium: number;
};

/** Demand per Category for the Market: this round's during a Shift (with `preview`'s use), next round's in the shop. */
export function demandViews(run: ThroughputRun, preview: ShiftResult | null): DemandView[] {
  const next = run.round + 1;
  const lastRound = run.round >= run.lastPlannedRound;
  const bossCut = demandBossCut(run, run.phase === 'shift' ? run.round : next);
  return CATEGORIES.map((category) => {
    const { scale, premium } = run.grants[category];
    if (run.phase !== 'shift') {
      const full = next <= run.lastPlannedRound ? run.demandIn(next, category) : run.demand[category];
      const halved = run.trends[next - 1]?.[category] === 'saturated';
      return { category, left: full, full, using: 0, halved, bossCut, earned: 0, wouldEarn: 0, sellsOut: false, ifKeepGoing: false, scale, premium };
    }
    return {
      category,
      left: run.demandLeft[category],
      full: run.roundDemand[category],
      using: preview?.demandSold[category] ?? 0,
      halved: run.trendsNow[category] === 'saturated',
      bossCut,
      // Growth counts from next round: in the last planned round, only if the run keeps going.
      earned: run.demandEarned[category],
      wouldEarn: preview?.demandGrowth[category] ?? 0,
      sellsOut: preview?.soldOut.includes(category) ?? false,
      ifKeepGoing: lastRound,
      scale,
      premium,
    };
  });
}

/** "Recession ×0.5" when `round`'s Board boss cuts Demand, else null. */
export function demandBossCut(run: ThroughputRun, round: number): string | null {
  const boss = round <= run.lastPlannedRound ? run.bossOf(round) : null;
  const mul = boss?.demandMul() ?? 1;
  return boss == null || mul === 1 ? null : `${boss.name} ×${formatAmount(mul)}`;
}

/** What the end-of-run screen shows. */
export type RunSummary = {
  readonly won: boolean;
  /** The run kept going past its win (endless), so it ended at a missed target after the win. */
  readonly endless: boolean;
  /** The round that won the run, or null if it wasn't won. */
  readonly wonAtRound: number | null;
  /** Sales across every round played, including the last. */
  readonly totalSales: number;
  readonly roundsCleared: number;
  readonly rounds: number;
  /** The run's biggest single Shift and where it was, e.g. "Year 3 Q1, Shift 2". */
  readonly bestShift: { readonly total: number; readonly where: string } | null;
  /** One line on how the run ended. */
  readonly outcome: string;
  /** The final Line's Fixtures by slot (null for a bay without one). */
  readonly line: readonly (CardView | null)[];
  /** The final deck, identical cards stacked, Designs then Makes then Ships; bought or improved ones say so in a tag. */
  readonly deck: readonly { readonly view: CardView; readonly count: number }[];
  /** Cards in the final deck. */
  readonly deckSize: number;
  /** R&D Grants bought, per Category, e.g. "Gadgets Scale 1, Premium ×1.5". */
  readonly grants: readonly string[];
  /** The Board boss of the last round played, if it was a Board Review. */
  readonly finalBoss: { readonly id: string; readonly name: string } | null;
  readonly seed: number;
};

/** "Year 2 Q1" or "Year 2 Board Review". */
function quarterName(run: ThroughputRun, round: number): string {
  const q = run.quarterOf(round);
  return `Year ${q.year} ${q.isBoard ? 'Board Review' : `Q${q.quarter}`}`;
}

/** "$12,480". */
export function money(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

export function runSummary(run: ThroughputRun): RunSummary {
  let bestShift: RunSummary['bestShift'] = null;
  for (const record of run.history) {
    for (const [i, total] of record.shiftTotals.entries()) {
      if (bestShift === null || total > bestShift.total) bestShift = { total, where: `${quarterName(run, record.round)}, Shift ${i + 1}` };
    }
  }
  const last = run.history[run.history.length - 1];
  const won = run.phase === 'won';
  const boss = last === undefined ? null : run.bossOf(last.round);
  const outcome =
    last === undefined
      ? ''
      : won
        ? `Cleared all ${run.rounds} rounds, through the ${quarterName(run, last.round)}.`
        : run.endless
          ? `Won the run, then missed the ${quarterName(run, last.round)} target by ${money(last.target - last.sales)}.`
          : `Missed the ${quarterName(run, last.round)} target by ${money(last.target - last.sales)}.`;
  return {
    won,
    endless: run.endless,
    wonAtRound: run.wonAtRound,
    totalSales: run.history.reduce((sum, r) => sum + r.sales, 0),
    roundsCleared: run.history.filter((r) => r.won).length,
    rounds: run.rounds,
    bestShift,
    outcome,
    // Each Fixture reads as its bay plate did: the short gist and what it does now.
    line: run.line.map((slot, i) => (slot.fixture === null ? null : { ...fixtureView(slot.fixture.def, `summary-fixture-${i}`), description: plateText(slot.fixture) })),
    deck: deckStacks(run.deck),
    deckSize: run.deck.length,
    grants: CATEGORIES.flatMap((c) => {
      const { scale, premium } = run.grants[c];
      const parts = [scale > 0 ? `Scale ${scale}` : '', premium > 0 ? `Premium ×${formatAmount(1 + run.config.grant.premiumStep * premium)}` : ''].filter(Boolean);
      return parts.length === 0 ? [] : [`${c} ${parts.join(', ')}`];
    }),
    finalBoss: boss == null ? null : { id: boss.id, name: boss.name },
    seed: run.seed,
  };
}

const STAGE_ORDER: readonly Stage[] = ['design', 'make', 'ship'];

/** Identical cards (same card, Category, upgrades, growth, bought or not) as one view with a count, Designs first. */
function deckStacks(deck: readonly Card[]): { view: CardView; count: number }[] {
  const stacks = new Map<string, { card: Card; count: number }>();
  for (const card of deck) {
    const key = `${card.def.id}|${card.category}|${card.upgrades}|${card.growth}|${card.paid > 0}`;
    const stack = stacks.get(key);
    if (stack === undefined) stacks.set(key, { card, count: 1 });
    else stack.count++;
  }
  return [...stacks.values()]
    .sort((a, b) => STAGE_ORDER.indexOf(a.card.def.stage) - STAGE_ORDER.indexOf(b.card.def.stage) || a.card.def.name.localeCompare(b.card.def.name) || a.card.category.localeCompare(b.card.category))
    .map(({ card, count }) => {
      const view = cardView(card, `summary-card-${card.uid}`);
      const mark = card.upgrades > 0 || card.growth > 0 ? 'Improved' : card.paid > 0 ? 'Bought' : null;
      return { view: mark === null ? view : { ...view, tags: [...view.tags, mark] }, count };
    });
}

/** What overkill pays, for the hover on the receipt's "+NC overkill". */
export function overkillHelp(config: ThroughputConfig): string {
  return `Overkill: when a round clears, each full ${Math.round(config.overkill.step * 100)}% of the target you sold past it pays +1C (at most +${config.overkill.cap}C a round).`;
}

/** A hover explanation for a receipt event that names a rule rather than a card or Fixture; undefined otherwise. */
export function eventHelp(event: string): string | undefined {
  if (event.startsWith('Handoff')) return 'Handoff: a card right after another card of the same Category adds +$1 Margin.';
  if (event === NO_SHIP_AFTER) return "No Ship comes after this slot, so this Make's Units don't sell: they clear as leftovers at the end of the Shift.";
  // A repeat Design names itself, e.g. "2nd Rebrand Margin ×1.5".
  const repeat = /^\d+(?:st|nd|rd|th) (.+) Margin ×/.exec(event)?.[1];
  const def = repeat === undefined ? undefined : SHOP_CARDS.find((d) => d.name === repeat);
  return def === undefined ? undefined : (repeatRule(def) ?? undefined);
}
