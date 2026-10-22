import { computeInterest, interestCeiling } from '../../../engine/economy';
import { TRUCK } from '../content';
import { Batch, CATEGORIES, cardEffect, cardName, formatAmount, growthText, shipCap } from '../model';
import type { Card, CardDef, Category, Fixture, TrendStage } from '../model';
import type { BuyTarget, FixtureMove, Offer, ShiftResult, ThroughputRun, Trends } from '../rules';

const STAGE_ORDER: readonly TrendStage[] = ['hot', 'emerging', 'saturated', 'neutral'];
const STAGE_NAME: Readonly<Record<TrendStage, string>> = { hot: 'Hot', emerging: 'Emerging', saturated: 'Saturated', neutral: 'Neutral' };
const TYPE_NAME = { design: 'Design', make: 'Make', ship: 'Ship' } as const;

export type ViewContext = { readonly game: string; readonly seed: number; readonly actionsTaken: number };

/** "Y2 Q1", "Y1 Board". */
export function quarterLabel(run: ThroughputRun, round: number): string {
  const q = run.quarterOf(round);
  return `Y${q.year} ${q.isBoard ? 'Board' : `Q${q.quarter}`}`;
}

/** A card as the shop offers it, before it is in the deck. */
function freshCard(def: CardDef, category: Category): Card {
  return { uid: -1, def, category, paid: 0, upgrades: 0, growth: 0 };
}

/**
 * "Now ×1.6." for a Fixture whose sale × grows (Flagship Store), else ''. Given the Shift during a
 * round, a Fixture whose × works in Shift 1 only (Express Lane) says "Now ×3 (Shift 1 only)." in
 * Shift 1 and "Shift 1 only: ×3; idle now." after it.
 */
export function fixtureNow(fixture: Fixture, shift?: number): string {
  const standing = fixture.def.effect.saleMultiplier(freshCard(TRUCK, 'Food'), fixture);
  if (standing !== 1) return `Now ×${formatAmount(standing)}.`;
  const first = shiftOneOnly(fixture);
  if (shift === undefined || first === null) return '';
  return shift === 1 ? `Now ×${formatAmount(first)} (Shift 1 only).` : `Shift 1 only: ×${formatAmount(first)}; idle now.`;
}

/** The sale × of a Fixture that works in a round's Shift 1 only (Express Lane), else null. */
export function shiftOneOnly(fixture: Fixture): number | null {
  const inShift = (shift: number) =>
    fixture.def.effect.saleMultiplier(freshCard(TRUCK, 'Food'), fixture, new Batch({ baseMargin: 0, stored: 0, warehouseOpen: false, boardReview: false, shift, tracing: false }));
  const first = inShift(1);
  return first !== 1 && inShift(2) === 1 ? first : null;
}

export function fixtureText(fixture: Fixture, shift?: number): string {
  const now = fixtureNow(fixture, shift);
  return `${fixture.def.name} (${fixture.def.kind === 'station' ? 'Station' : 'Mod'}): ${fixture.def.text}${now === '' ? '' : ` ${now}`}`;
}

/** The cards a Shift grew for good, once each with how much, e.g. "Sketch-H +$1, Workshop-G +3 Units". */
export function grownText(grown: readonly Card[]): string {
  const points = new Map<Card, number>();
  for (const card of grown) points.set(card, (points.get(card) ?? 0) + 1);
  return [...points].map(([card, n]) => `${cardName(card)} ${card.def.stage === 'make' ? `+${n} Units` : `+$${n}`}`).join(', ');
}

export function cardText(card: Card): string {
  const extras = [card.upgrades > 0 ? `${card.upgrades} upgrade${card.upgrades === 1 ? '' : 's'}` : '', growthText(card)]
    .filter(Boolean)
    .join(', ');
  return `${cardName(card)} · ${cardEffect(card)}${extras === '' ? '' : ` (${extras})`}`;
}

export function offerText(offer: Offer): string {
  switch (offer.kind) {
    case 'fixture':
      return `Fixture · ${offer.def.name} (${offer.def.kind === 'station' ? 'Station' : 'Mod'}, ${offer.def.rarity}) · ${offer.price}C: ${offer.def.text}`;
    case 'card': {
      // Same text as the deck shows once bought.
      const effect = cardEffect(freshCard(offer.def, offer.category)).replace(/^\w+: /, '');
      return `Card · ${offer.def.name}-${offer.category.charAt(0)} (${offer.category} ${TYPE_NAME[offer.def.stage]}) · ${offer.price}C: ${effect}`;
    }
    case 'contract':
      return `Contract · ${offer.def.name} · ${offer.price}C: ${offer.def.text}`;
  }
}

/** One line per trend stage holder, e.g. "Hot Apparel · Emerging Food · Saturated Home · Neutral Gadgets". */
export function trendsText(trends: Trends, hotNote = ''): string {
  return STAGE_ORDER.flatMap((stage) =>
    CATEGORIES.filter((c) => trends[c] === stage).map((c) => `${STAGE_NAME[stage]} ${c}${stage === 'hot' ? hotNote : ''}`),
  ).join(' · ');
}

/** The Batch trace of a Shift, slot by slot. */
export function traceLines(result: ShiftResult, indent = '  '): string[] {
  const lines = result.steps.map((step) => {
    const events = step.events.length > 0 ? `${step.events.join('; ')} → ` : '';
    return `${indent}${step.slot}. ${step.label}: ${events}Units ${step.units}, Margin $${formatAmount(step.margin)}, Sales $${step.sales}`;
  });
  const leftover: string[] = [];
  if (result.stockedUnits > 0) leftover.push(`${result.stockedUnits} Units copied into Warehouse stock`);
  const cleared = result.leftover;
  if (cleared > 0) leftover.push(`${cleared} Units cleared for ${result.overstockSales < 0 ? '-' : ''}$${Math.abs(result.overstockSales)}${result.capped ? ' (Sales had reached the Shift cap)' : ''}`);
  const capped = result.capped ? ` (its sales stopped at the $${result.total} Shift cap; Units past it didn't sell)` : '';
  lines.push(`${indent}Leftover: ${leftover.length > 0 ? leftover.join(', ') : 'none'}. Shift total $${result.total}${capped}.`);
  return lines;
}

/** "clears the target, +3C overkill (sold 2.48× the target)" if round Sales of `sales` would clear, else ''. */
export function overkillNote(run: ThroughputRun, sales: number): string {
  if (sales < run.target) return '';
  const pay = run.overkillPayFor(sales);
  // Rounded down, so a ratio never reads past the overkill step it hasn't reached.
  const times = Math.floor((100 * sales) / run.target) / 100;
  return pay > 0 ? `clears the target, +${pay}C overkill (sold ${formatAmount(times)}× the target)` : 'clears the target';
}

/** "Showroom 5→1, Quality Lab 1→2" (1-based slots). */
export function movesText(moves: readonly FixtureMove[]): string {
  return moves.map((m) => `${m.fixture.def.name} ${m.from + 1}→${m.to + 1}`).join(', ');
}

/** 1-based numbers with runs collapsed: [0, 1, 2, 4] → "1–3, 5". */
function ranges(ns: readonly number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && (ns[j + 1] as number) === (ns[j] as number) + 1) j++;
    const first = (ns[i] as number) + 1;
    const last = (ns[j] as number) + 1;
    out.push(first === last ? String(first) : `${first}–${last}`);
    i = j + 1;
  }
  return out.join(', ');
}

/** Hand numbers (0-based positions) of the cards in hand. */
function handNumbers(run: ThroughputRun): number[] {
  return run.handSlots.flatMap((card, i) => (card === null ? [] : [i]));
}

/** Why no target makes this offer buyable right now, or null if one does (or it is sold). */
export function offerBlocker(run: ThroughputRun, offer: number): string | null {
  const item = run.offers[offer];
  if (item == null) return null;
  if (item.kind === 'fixture') {
    // A Fixture bought over another sells that one, so its refund counts toward the price.
    if (run.line.some((_, s) => run.whyCannotBuy(offer, { slot: s }) === null)) return null;
    const refund = Math.max(...run.line.map((_, s) => run.fixtureRefund(s)));
    return `needs ${item.price}C (you have ${run.wallet.cash}C${refund > 0 ? `, +${refund}C at most from the Fixture it replaces` : ''})`;
  }
  if (!run.wallet.canAfford(item.price)) return `needs ${item.price}C (you have ${run.wallet.cash}C)`;
  return run.whyCannotBuy(offer, sampleTarget(item));
}

/** A legal-looking target for `item`, to ask whether anything but the target blocks buying it. */
function sampleTarget(item: Offer): BuyTarget {
  if (item.kind !== 'contract') return {};
  if (item.def.targetsCard) return { deckCard: 0 };
  return item.def.targetsCategory ? { category: 'Apparel', option: 'scale' } : {};
}

export function legalActions(run: ThroughputRun): string[] {
  const out: string[] = [];
  const list = (ns: readonly number[]) => ns.map((n) => n + 1).join(', ');
  const slots = run.line.map((_, i) => i);
  if (run.phase === 'shift') {
    const hand = handNumbers(run);
    const open = slots.filter((i) => run.whyCannotLoad([{ hand: 0, slot: i }]) === null);
    if (hand.length > 0 && open.length > 0) {
      const cards = hand.length === 1 ? `hand card ${ranges(hand)}` : `hand cards (${ranges(hand)})`;
      out.push(`load <hand>:<slot> … — put ${cards} into open slots (${list(open)})`);
    }
    const loaded = slots.filter((i) => run.whyCannotUnload([i]) === null);
    const recall = run.boss?.recallsParked() === true ? `, or parked ones (${run.boss.name})` : '';
    if (loaded.length > 0) out.push(`unload <slot> … — take back cards loaded this Shift${recall} (slots ${list(loaded)})`);
    const parked = slots.filter((i) => run.whyCannotScrap([i]) === null);
    if (parked.length > 0) out.push(`scrap <slot> … — discard parked cards to free their slots (slots ${list(parked)})`);
    if (run.whyCannotRetool([0]) === null) {
      const most = Math.min(run.config.retoolMax, run.hand.length);
      const cards = most === 1 ? '1 hand card' : `1–${most} hand cards`;
      const limit = most < run.config.retoolMax ? ` (up to ${run.config.retoolMax}; you hold ${run.hand.length})` : '';
      out.push(`retool <hand> … — discard ${cards}${limit} and draw as many into their places (${run.retoolsLeft} left this round)`);
    }
    const preview = run.preview();
    const after = Math.max(0, run.sales + preview.total);
    const clears = overkillNote(run, after);
    const capped = preview.capped ? ', stopped at the Shift cap' : '';
    out.push(`run — run Shift ${run.shift} of ${run.shiftsThisRound} (makes $${preview.total}${capped}; round reaches $${after} of $${run.target}${clears === '' ? '' : `; ${clears}`})`);
  }
  if (run.phase === 'shop') {
    run.offers.forEach((offer, i) => {
      if (offer === null || run.whyCannotBuy(i, { slot: 0, deckCard: 0 }) === 'The shop is closed') return;
      const n = i + 1;
      if (offer.kind === 'fixture') {
        const buyable = slots.filter((s) => run.whyCannotBuy(i, { slot: s }) === null);
        const free = buyable.filter((s) => run.line[s]?.fixture == null);
        const over = buyable.flatMap((s) => {
          const old = run.line[s]?.fixture;
          return old == null ? [] : [`slot ${s + 1} ${old.def.name} +${run.fixtureRefund(s)}C`];
        });
        if (free.length > 0) out.push(`buy ${n} <slot> — ${offer.def.name} for ${offer.price}C into a slot without a Fixture (${list(free)})`);
        if (over.length > 0) out.push(`buy ${n} <slot> — ${offer.def.name} for ${offer.price}C over a Fixture, which is sold for half as part of the buy (${over.join('; ')})`);
      } else if (offer.kind === 'contract' && offer.def.targetsCard) {
        if (run.whyCannotBuy(i, { deckCard: 0 }) === null) out.push(`buy ${n} <deck card> — ${offer.def.name} for ${offer.price}C (deck cards 1–${run.deck.length})`);
      } else if (offer.kind === 'contract' && offer.def.targetsCategory) {
        const g = run.config.grant;
        if (run.whyCannotBuy(i, sampleTarget(offer)) === null) {
          out.push(
            `buy ${n} <category> scale|premium — ${offer.def.name} for ${offer.price}C: Scale gives that Category's Demand +${g.scaleDemand} for good, and each of its Ship cards adds +${g.scaleUnits} Units to the Batch just before it sells; Premium: its sales +${Math.round(g.premiumStep * 100)}% price`,
          );
        }
      } else if (run.whyCannotBuy(i) === null) {
        out.push(`buy ${n} — ${offer.kind === 'card' ? `${offer.def.name}-${offer.category.charAt(0)} into your deck` : offer.def.name} for ${offer.price}C`);
      }
    });
    run.line.forEach((slot, i) => {
      if (slot.fixture !== null) out.push(`sell fixture ${i + 1} — ${slot.fixture.def.name} for ${Math.floor(slot.fixture.paid * run.config.sellRate)}C`);
    });
    run.deck.forEach((card, i) => {
      if (run.whyCannotSellCard(i) === null) out.push(`sell card ${i + 1} — ${cardName(card)} for ${Math.floor(card.paid * run.config.sellRate)}C`);
    });
    const movable = slots.filter((i) => run.line[i]?.fixture != null);
    if (movable.length > 0 && run.wallet.canAfford(run.config.moveCost)) {
      out.push(`move <from> <to> — move a Fixture for ${run.config.moveCost}C, swapping with any Fixture there (Fixtures in ${list(movable)})`);
    }
    if (run.whyCannotReroll() === null) out.push(`reroll — new offers for ${run.rerollCost}C (${interestTrade(run, run.rerollCost)})`);
    out.push(`continue — start ${quarterLabel(run, run.round + 1)} (round ${run.round + 1}, target $${run.targetFor(run.round + 1)})`);
  }
  if (run.phase === 'shift' || run.phase === 'shop') out.push('deck — list your cards and what is left to draw (free)');
  if (run.canKeepGoing) {
    const next = run.round + 1;
    out.push(
      `keep going — play on past the win: a shop, then ${quarterLabel(run, next)} (round ${next}, target $${run.targetFor(next)}); targets climb ×${run.config.endlessGrowth} a round and the run ends at the first missed target`,
    );
  }
  out.push('rules — show the full rules (free)');
  return out;
}

/** " · Restock ready" / " · Restock used (9 cards): …" for the Shift header ('' when the config has no Restock). */
function restockText(run: ThroughputRun): string {
  if (run.config.restocksPerRound <= 0) return '';
  if (run.restocksLeft > 0) return run.restocked > 0 ? ` · Restocked ${run.restocked} cards, ${run.restocksLeft} Restock left` : ' · Restock ready';
  return ` · Restock used (${run.restocked} cards): an empty draw pile stays empty this round`;
}

/** What happens to the card in a Line slot when the Shift runs, for the Line listing (worded as in the browser). */
function lineCardNote(run: ThroughputRun, slot: number): string {
  const held = run.line[slot]?.card;
  if (held == null) return '';
  const parked = held.loadedShift < run.shift;
  const since = parked ? `parked since Shift ${held.loadedShift}` : 'loaded this Shift';
  const recall = parked && run.whyCannotUnload([slot]) === null ? `; ${run.boss?.name ?? 'the boss'} lets you unload it` : '';
  return `[${since}; ${run.staysAfterShift(slot) ? 'stays for later Shifts' : 'used up this Shift'}${recall}]`;
}

/** Run-long perks from Contracts, e.g. "Perks: +1 Hot pip a round, +1 Retool a round, +1C a round", or '' if none. */
export function perksText(run: ThroughputRun): string {
  const { hotPips, retools, coupon } = run.perks;
  const plural = (n: number, word: string) => `+${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [
    hotPips > 0 ? `${plural(hotPips, 'Hot pip')} a round` : '',
    retools > 0 ? `${plural(retools, 'Retool')} a round` : '',
    coupon > 0 ? `+${coupon}C a round (Treasury Bond)` : '',
  ].filter(Boolean);
  return parts.length === 0 ? '' : `Perks: ${parts.join(', ')}.`;
}

export function formatView(run: ThroughputRun, context: ViewContext): string {
  const lines = [`THROUGHPUT · seed ${context.seed} · ${context.actionsTaken} actions`];
  const where = `${quarterLabel(run, run.round)} (${roundOf(run, run.round)})`;
  switch (run.phase) {
    case 'shift':
      lines.push(
        `${where} · Shift ${run.shift} of ${run.shiftsThisRound} · Sales $${run.sales} of $${run.target} target · Capital ${run.wallet.cash}C`,
        `Retools left this round ${run.retoolsLeft} · Draw pile ${run.drawPile.length} (${shipsToDraw(run)} Ship${shipsToDraw(run) === 1 ? '' : 's'}) · Discard pile ${run.discardPile.length}${restockText(run)}${run.stored > 0 ? ` · Stored ${run.stored} Units` : ''}`,
      );
      if (perksText(run) !== '') lines.push(perksText(run));
      if (run.boss !== null) lines.push(`BOARD REVIEW: ${run.boss.name}: ${run.boss.text}${run.shiftCap === null ? '' : ` This round: at most $${run.shiftCap} a Shift.`}`);
      if (run.fixtureMoves.length > 0) lines.push(`${run.boss?.name ?? 'The boss'} moved your Fixtures before this Shift: ${movesText(run.fixtureMoves)}.`);
      break;
    case 'shop': {
      lines.push(`Shop after ${where} · Capital ${run.wallet.cash}C${run.stored > 0 ? ` · Stored ${run.stored} Units` : ''}`);
      if (run.lastPayout !== null) lines.push(`Payout: ${run.lastPayout.map((l) => `${l.source} ${l.amount}C`).join(', ')}`);
      if (run.storageNotice !== null) lines.push(run.storageNotice);
      const rule = run.interestRule;
      const interest = computeInterest(run.wallet.cash, rule);
      const ceiling = interestCeiling(rule);
      const idle = run.wallet.cash >= ceiling ? ` Capital above ${ceiling}C earns nothing.` : '';
      lines.push(`Interest: holding ${run.wallet.cash}C when the next round clears pays +${interest}C (${rule.amount}C per full ${rule.per}C, at most +${rule.cap}C).${idle}`);
      if (perksText(run) !== '') lines.push(perksText(run));
      break;
    }
    case 'won':
      lines.push(`YOU WON: cleared all ${run.rounds} rounds. Final Capital ${run.wallet.cash}C.`);
      break;
    case 'lost':
      lines.push(`RUN OVER: ${where} ended with Sales $${run.sales} of $${run.target}${endlessNote(run)}.`);
      break;
  }
  if (run.phase === 'won' || run.phase === 'lost') {
    lines.push('', 'Legal actions:', ...legalActions(run).map((a) => `  ${a}`));
    return lines.join('\n');
  }

  lines.push('', ...marketLines(run));
  const boards = run.upcomingBoards();
  if (boards.length > 0) lines.push(`Board Reviews ahead: ${boards.map((b) => `${quarterLabel(run, b.round)} (round ${b.round}): ${b.boss.name}: ${b.boss.text}`).join(' | ')}`);

  lines.push('', run.phase === 'shift' ? `Line (the Batch runs left to right from 0 Units, Margin $${run.config.baseMargin}):` : 'Line Fixtures:');
  run.line.forEach((slot, i) => {
    const fixture = run.isWelded(i) && run.phase === 'shift' ? 'WELDED SHUT' : slot.fixture === null ? 'no Fixture' : fixtureText(slot.fixture, run.phase === 'shift' ? run.shift : undefined);
    const card = slot.card?.card;
    const idle = card !== undefined && slot.fixture !== null && slot.fixture.def.kind === 'mod' && !slot.fixture.def.effect.appliesTo(card) ? ` (${slot.fixture.def.name} is idle for it)` : '';
    const held = card === undefined ? '' : ` | ${cardText(card)}${demandNote(run, card)} ${lineCardNote(run, i)}${idle}`;
    lines.push(`  ${i + 1}. ${fixture}${held}`);
  });

  if (run.phase === 'shift') {
    const hand = run.handSlots.flatMap((card, i) => (card === null ? [] : [`  ${i + 1}. ${cardText(card)}${demandNote(run, card)}`]));
    lines.push('', `Hand (${run.hand.length}; a card keeps its number until it leaves the hand):`, ...hand);
    const preview = run.preview();
    const clears = overkillNote(run, Math.max(0, run.sales + preview.total));
    lines.push('', 'If you run now:', ...traceLines(preview));
    const noShip = noShipNote(run);
    if (noShip !== null) lines.push(`  ${noShip}`);
    const demand = demandUseText(preview, run);
    if (demand !== '') lines.push(`  Demand used: ${demand}.`);
    if (clears !== '') lines.push(`  This Shift ${clears}.`);
  } else {
    lines.push(...nextBoardLayout(run));
    lines.push('', `Shop (reroll ${run.rerollCost}C; holding ${run.wallet.cash}C → +${computeInterest(run.wallet.cash, run.interestRule)}C interest):`);
    run.offers.forEach((offer, i) => {
      const blocker = offerBlocker(run, i);
      lines.push(`  ${i + 1}. ${offer === null ? '(bought; a reroll or the next shop refills it)' : offerText(offer)}${blocker === null ? '' : ` [can't buy: ${blocker}]`}`);
    });
    // Deck numbers matter in the shop only for a Contract that targets a card; otherwise keep the screen short.
    const picksCard = run.offers.some((o) => o?.kind === 'contract' && o.def.targetsCard);
    if (picksCard) lines.push('', `Deck (${run.deck.length} cards; numbers are for contracts and selling):`, ...run.deck.map((card, i) => `  ${i + 1}. ${cardText(card)}`));
    else lines.push('', `Deck: ${run.deck.length} cards ("deck" lists them).`);
  }
  lines.push('', 'Legal actions:', ...legalActions(run).map((a) => `  ${a}`));
  return lines.join('\n');
}

/** In the shop before a Board whose boss moves Fixtures: where they will be for Shift 1 and Shift 2. */
function nextBoardLayout(run: ThroughputRun): string[] {
  const boss = run.bossOf(run.round + 1);
  if (boss === null || !boss.movesFixtures()) return [];
  const before = run.line.map((s) => s.fixture);
  const layout = (fixtures: readonly (Fixture | null)[]) => fixtures.map((f, i) => `${i + 1}. ${f?.def.name ?? '-'}`).join(' · ');
  const first = boss.shiftFixtures(before, 1);
  const second = boss.shiftFixtures(first, 2);
  const shift1 = first.every((f, i) => f === before[i]) ? `Shift 1 runs on your layout` : `before Shift 1 your Fixtures move to ${layout(first)}`;
  return [`${boss.name} next round: ${shift1}; before Shift 2, to ${layout(second)}.`];
}

function marketLines(run: ThroughputRun): string[] {
  const first = run.phase === 'shop' ? run.round + 1 : run.round;
  const lines = [`Market (${run.phase === 'shop' ? 'next round' : 'this round'} and the 3 after):`];
  for (let round = first; round < first + 4 && round <= run.lastPlannedRound; round++) {
    const trends = run.trends[round - 1];
    if (trends === undefined) continue;
    const now = round === run.round && run.phase === 'shift';
    const hot = CATEGORIES.find((c) => trends[c] === 'hot');
    const pips = now
      ? ` (${run.hotPipsLeft} buzz pip${run.hotPipsLeft === 1 ? '' : 's'} left; a Shift that sells ${hot ?? 'it'} spends one and gets ×${formatAmount(run.config.hotMultiplier)})`
      : '';
    lines.push(`  ${now ? 'now ' : '    '}${quarterLabel(run, round)}: ${trendsText(trends, pips)}`);
  }
  lines.push(demandLine(run));
  return lines;
}

/**
 * Demand per Category: during a Shift what is left of this round's (with why it is lower or will
 * grow), in the shop what next round's will be.
 */
function demandLine(run: ThroughputRun): string {
  const shop = run.phase !== 'shift';
  const next = run.round + 1;
  const parts = CATEGORIES.map((c) => {
    const { scale, premium } = run.grants[c];
    const notes: string[] = [];
    const saturated = (shop ? run.trends[next - 1]?.[c] : run.trendsNow[c]) === 'saturated';
    if (saturated) notes.push(shop ? `Saturated: halved from ${run.demand[c]}` : 'Saturated: halved');
    const boss = run.bossOf(shop ? next : run.round);
    if (boss != null && boss.demandMul() !== 1 && (shop ? next : run.round) <= run.lastPlannedRound) notes.push(`${boss.name} ×${formatAmount(boss.demandMul())}`);
    if (!shop && run.demandEarned[c] > 0) notes.push(`+${run.demandEarned[c]} ${fromNextRound(run)}`);
    if (scale > 0) notes.push(`Scale ${scale}`);
    const pricier = premium > 0 ? `, sells +${Math.round(100 * run.config.grant.premiumStep * premium)}% (Premium ${premium})` : '';
    const amount = shop
      ? String(next <= run.lastPlannedRound ? run.demandIn(next, c) : run.demand[c])
      : run.demandLeft[c] === 0
        ? 'sold out'
        : `${run.demandLeft[c]} of ${run.roundDemand[c]}`;
    return `${c} ${amount}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}${pricier}`;
  });
  return `  Demand ${shop ? 'next round' : 'left this round'}: ${parts.join(' · ')}`;
}

/**
 * What `result` (a Shift of `run`'s current round) sells into Demand and the Demand it grows, e.g.
 * "Home 12 (sells out: +10 from next round)", or with both causes "Home 12 (+20 from next round:
 * sell-out +10, Emerging +10)". In the last planned round growth counts only if you keep going, so
 * it says "from next round if you keep going".
 */
export function demandUseText(result: ShiftResult, run: ThroughputRun): string {
  const from = fromNextRound(run);
  return CATEGORIES.flatMap((c) => {
    const sold = result.demandSold[c] ?? 0;
    const grows = result.demandGrowth[c] ?? 0;
    if (sold === 0 && grows === 0) return [];
    if (grows === 0) return [`${c} ${sold}`];
    const emerging = result.emergingSold.includes(c) ? run.config.demand.emergingGrowth : 0;
    const sellOut = grows - emerging;
    if (sellOut > 0 && emerging > 0) return [`${c} ${sold} (+${grows} ${from}: sell-out +${sellOut}, Emerging +${emerging})`];
    return [`${c} ${sold} (${sellOut > 0 ? 'sells out' : 'Emerging sale'}: +${grows} ${from})`];
  }).join(', ');
}

/** "from next round", or in the last planned round (before keeping going) "from next round if you keep going". */
export function fromNextRound(run: ThroughputRun): string {
  return run.round >= run.lastPlannedRound ? 'from next round if you keep going' : 'from next round';
}

/** "round 3 of 12", or once the run keeps going past its win "round 14; endless, won at round 12". */
export function roundOf(run: ThroughputRun, round: number): string {
  return run.endless ? `round ${round}; endless, won at round ${run.wonAtRound ?? run.rounds}` : `round ${round} of ${run.rounds}`;
}

/** For a run that kept going and then lost: ", after winning at round 12 (Y4 Board) and reaching Y5 Q2"; else ''. */
export function endlessNote(run: ThroughputRun): string {
  if (!run.endless || run.wonAtRound === null) return '';
  return `, after winning at round ${run.wonAtRound} (${quarterLabel(run, run.wonAtRound)}) and reaching ${quarterLabel(run, run.round)}`;
}

/**
 * During a Shift, a Ship card's Category Demand left: " (Home 2 left)", or " (Gadgets sold out:
 * sells 0)" when none is left; '' for a Ship that ignores Demand, and for other cards.
 */
export function demandNote(run: ThroughputRun, card: Card): string {
  if (run.phase !== 'shift' || card.def.stage !== 'ship' || shipCap(card) === 'all') return '';
  const left = run.demandLeft[card.category];
  return left === 0 ? ` (${card.category} sold out: sells 0)` : ` (${card.category} ${left} left)`;
}

/** Ship cards left in the draw pile. */
export function shipsToDraw(run: ThroughputRun): number {
  return run.drawPile.filter((c) => c.def.stage === 'ship').length;
}

/**
 * When the Line holds cards but no Ship (outside a welded slot), what the Shift still earns, so a
 * $0 preview isn't a mystery: its leftover Units at the overstock value. Null if a Ship is loaded,
 * or if nothing is loaded yet (an empty Line at the start of a Shift needs no warning).
 */
export function noShipNote(run: ThroughputRun): string | null {
  if (run.phase !== 'shift' || run.line.every((slot) => slot.card == null)) return null;
  if (run.line.some((slot, i) => slot.card?.card.def.stage === 'ship' && !run.isWelded(i))) return null;
  const value = run.boss?.overstockValue(run.config.overstockValue) ?? run.config.overstockValue;
  return value >= 0
    ? `No Ship on the Line, so nothing sells: each Unit left at the end of the Shift clears for $${value}.`
    : `No Ship on the Line, so nothing sells, and under ${run.boss?.name ?? 'this boss'} each Unit left at the end costs $${-value}.`;
}

/**
 * What spending `cost` does to next round's interest, with one interest figure: "then holding 11C →
 * +2C interest", or "then holding 9C → +1C interest, 1C less" when the spend lowers it.
 */
export function interestTrade(run: ThroughputRun, cost: number): string {
  const now = computeInterest(run.wallet.cash, run.interestRule);
  const after = computeInterest(Math.max(0, run.wallet.cash - cost), run.interestRule);
  return `then holding ${run.wallet.cash - cost}C → +${after}C interest${after < now ? `, ${now - after}C less` : ''}`;
}

/** Free `deck` query: every card and what is left to draw this round. */
export function deckText(run: ThroughputRun): string[] {
  const lines = [`Deck (${run.deck.length} cards):`, ...run.deck.map((card, i) => `  ${i + 1}. ${cardText(card)}`)];
  if (run.phase === 'shift') {
    const counts = new Map<string, number>();
    for (const card of run.drawPile) counts.set(cardName(card), (counts.get(cardName(card)) ?? 0) + 1);
    const pile = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
    lines.push(`Left to draw this round (${run.drawPile.length}, order hidden): ${pile.join(', ') || 'nothing'}`);
    if (run.restocksLeft > 0) lines.push(`Restock: when the pile runs out, your ${run.discardPile.length} discards (and any discarded later) are shuffled into a new pile (${run.restocksLeft === 1 ? 'once' : `${run.restocksLeft} times`}).`);
  }
  return lines;
}

/** JSON-safe snapshot for --json. */
export function stateData(run: ThroughputRun, context: ViewContext): Record<string, unknown> {
  const fixture = (f: Fixture | null) => (f === null ? null : { id: f.def.id, name: f.def.name, kind: f.def.kind, text: fixtureText(f), roundsOwned: f.roundsOwned });
  const card = (c: Card) => ({ name: cardName(c), id: c.def.id, stage: c.def.stage, category: c.category, effect: cardEffect(c), upgrades: c.upgrades, growth: c.growth });
  const demand: Partial<Record<Category, { left: number; demand: number; scale: number; premium: number }>> = {};
  for (const c of CATEGORIES) demand[c] = { left: run.demandLeft[c], demand: run.demand[c], ...run.grants[c] };
  return {
    ...context,
    phase: run.phase,
    round: run.round,
    rounds: run.rounds,
    endless: run.endless,
    wonAtRound: run.wonAtRound,
    quarter: quarterLabel(run, run.round),
    target: run.target,
    sales: run.sales,
    shift: run.shift,
    shiftsThisRound: run.shiftsThisRound,
    capital: run.wallet.cash,
    perks: run.perks,
    retoolsLeft: run.retoolsLeft,
    drawPile: run.drawPile.length,
    discardPile: run.discardPile.length,
    stored: run.stored,
    hotPipsLeft: run.hotPipsLeft,
    boss: run.boss === null ? null : { name: run.boss.name, text: run.boss.text },
    fixtureMoves: run.phase === 'shift' ? run.fixtureMoves.map((m) => ({ fixture: m.fixture.def.name, from: m.from + 1, to: m.to + 1 })) : [],
    market: run.trends.slice(run.round - 1, run.round + 3).map((trends, i) => ({ round: run.round + i, trends })),
    demand,
    boards: run.upcomingBoards().map((b) => ({ round: b.round, boss: b.boss.name, text: b.boss.text })),
    line: run.line.map((slot, i) => ({
      slot: i + 1,
      welded: run.isWelded(i),
      fixture: fixture(slot.fixture),
      card: slot.card === null ? null : { ...card(slot.card.card), loadedShift: slot.card.loadedShift, staysAfterRun: run.staysAfterShift(i) },
    })),
    // `n` is the hand number to use in load/retool; it stays put while the card is in hand.
    hand: run.phase === 'shift' ? run.handSlots.flatMap((c, i) => (c === null ? [] : [{ n: i + 1, ...card(c) }])) : [],
    preview: run.phase === 'shift' ? previewData(run.preview()) : null,
    lastShift: run.lastShift === null ? null : previewData(run.lastShift),
    payout: run.lastPayout,
    shop:
      run.phase === 'shop'
        ? { rerollCost: run.rerollCost, offers: run.offers.map((o, i) => (o === null ? null : { kind: o.kind, text: offerText(o), price: o.price, blocked: offerBlocker(run, i) })) }
        : null,
    deck: run.deck.map(card),
    legalActions: legalActions(run),
  };
}

function previewData(result: ShiftResult) {
  return { steps: result.steps, leftover: result.leftover, stockedUnits: result.stockedUnits, overstockSales: result.overstockSales, total: result.total, capped: result.capped, overCap: result.overCap };
}
