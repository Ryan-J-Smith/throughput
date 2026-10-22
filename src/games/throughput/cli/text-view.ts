import { CATEGORIES, cardEffect, cardName, formatAmount } from '../model';
import type { Card, Category, Fixture, TrendStage } from '../model';
import type { Offer, ShiftResult, ThroughputRun, Trends } from '../rules';

const STAGE_ORDER: readonly TrendStage[] = ['hot', 'emerging', 'saturated', 'neutral'];
const STAGE_NAME: Readonly<Record<TrendStage, string>> = { hot: 'Hot', emerging: 'Emerging', saturated: 'Saturated', neutral: 'Neutral' };

export type ViewContext = { readonly game: string; readonly seed: number; readonly actionsTaken: number };

/** "Y2 Q1", "Y1 Board". */
export function quarterLabel(run: ThroughputRun, round: number): string {
  const q = run.quarterOf(round);
  return `Y${q.year} ${q.isBoard ? 'Board' : `Q${q.quarter}`}`;
}

export function fixtureText(fixture: Fixture): string {
  return `${fixture.def.name} (${fixture.def.kind === 'station' ? 'Station' : 'Mod'}): ${fixture.def.text}`;
}

export function cardText(card: Card): string {
  const extras = [card.upgrades > 0 ? `${card.upgrades} upgrade${card.upgrades === 1 ? '' : 's'}` : '', card.growth > 0 ? `R&D +$${card.growth}` : '']
    .filter(Boolean)
    .join(', ');
  return `${cardName(card)} · ${cardEffect(card)}${extras === '' ? '' : ` (${extras})`}`;
}

export function offerText(offer: Offer): string {
  switch (offer.kind) {
    case 'fixture':
      return `Fixture · ${offer.def.name} (${offer.def.kind === 'station' ? 'Station' : 'Mod'}, ${offer.def.rarity}) · ${offer.price}C: ${offer.def.text}`;
    case 'card':
      return `Card · ${offer.def.name}-${offer.category.charAt(0)} (${offer.category}) · ${offer.price}C: ${offer.def.text}`;
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
  if (result.storedUnits > 0) leftover.push(`${result.storedUnits} Units stored`);
  const cleared = result.leftover - result.storedUnits;
  if (cleared > 0) leftover.push(`${cleared} Units cleared for ${result.overstockSales < 0 ? '-' : ''}$${Math.abs(result.overstockSales)}`);
  lines.push(`${indent}Leftover: ${leftover.length > 0 ? leftover.join(', ') : 'none'}. Shift total $${result.total}.`);
  return lines;
}

export function legalActions(run: ThroughputRun): string[] {
  const out: string[] = [];
  const list = (ns: readonly number[]) => ns.map((n) => n + 1).join(', ');
  const slots = run.line.map((_, i) => i);
  if (run.phase === 'shift') {
    const open = slots.filter((i) => run.whyCannotLoad([{ hand: 0, slot: i }]) === null);
    if (run.hand.length > 0 && open.length > 0) {
      out.push(`load <hand>:<slot> … — put hand cards (1–${run.hand.length}) into open slots (${list(open)})`);
    }
    const loaded = slots.filter((i) => run.whyCannotUnload([i]) === null);
    if (loaded.length > 0) out.push(`unload <slot> … — take back cards loaded this Shift (slots ${list(loaded)})`);
    const parked = slots.filter((i) => run.whyCannotScrap([i]) === null);
    if (parked.length > 0) out.push(`scrap <slot> … — discard parked cards to free their slots (slots ${list(parked)})`);
    if (run.whyCannotRetool([0]) === null) {
      out.push(`retool <hand> … — discard 1–${Math.min(run.config.retoolMax, run.hand.length)} hand cards and draw as many (${run.retoolsLeft} left this round)`);
    }
    const preview = run.preview();
    out.push(`run — run Shift ${run.shift} of ${run.config.shiftsPerRound} (makes $${preview.total}; round reaches $${Math.max(0, run.sales + preview.total)} of $${run.target})`);
  }
  if (run.phase === 'shop') {
    run.offers.forEach((offer, i) => {
      if (offer === null || run.whyCannotBuy(i, { slot: 0, deckCard: 0 }) === 'The shop is closed') return;
      const n = i + 1;
      if (offer.kind === 'fixture') {
        const free = slots.filter((s) => run.whyCannotBuy(i, { slot: s }) === null);
        if (free.length > 0) out.push(`buy ${n} <slot> — ${offer.def.name} for ${offer.price}C into a slot without a Fixture (${list(free)})`);
      } else if (offer.kind === 'contract' && offer.def.targetsCard) {
        if (run.whyCannotBuy(i, { deckCard: 0 }) === null) out.push(`buy ${n} <deck card> — ${offer.def.name} for ${offer.price}C (deck cards 1–${run.deck.length})`);
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
    if (run.whyCannotReroll() === null) out.push(`reroll — new offers for ${run.rerollCost}C`);
    out.push(`continue — start ${quarterLabel(run, run.round + 1)} (round ${run.round + 1}, target $${run.config.targets[run.round] ?? 0})`);
  }
  if (run.phase === 'shift' || run.phase === 'shop') out.push('deck — list your cards and what is left to draw (free)');
  out.push('rules — show the full rules (free)');
  return out;
}

export function formatView(run: ThroughputRun, context: ViewContext): string {
  const lines = [`THROUGHPUT · seed ${context.seed} · ${context.actionsTaken} actions`];
  const where = `${quarterLabel(run, run.round)} (round ${run.round} of ${run.rounds})`;
  switch (run.phase) {
    case 'shift':
      lines.push(
        `${where} · Shift ${run.shift} of ${run.config.shiftsPerRound} · Sales $${run.sales} of $${run.target} target · Capital ${run.wallet.cash}C`,
        `Retools left ${run.retoolsLeft} · Draw pile ${run.drawPile.length} · Discard pile ${run.discardPile.length}${run.stored > 0 ? ` · Stored ${run.stored} Units` : ''}`,
      );
      if (run.boss !== null) lines.push(`BOARD REVIEW: ${run.boss.name}: ${run.boss.text}`);
      break;
    case 'shop':
      lines.push(`Shop after ${where} · Capital ${run.wallet.cash}C${run.stored > 0 ? ` · Stored ${run.stored} Units` : ''}`);
      if (run.lastPayout !== null) lines.push(`Payout: ${run.lastPayout.map((l) => `${l.source} ${l.amount}C`).join(', ')}`);
      if (run.storageNotice !== null) lines.push(run.storageNotice);
      break;
    case 'won':
      lines.push(`YOU WON: cleared all ${run.rounds} rounds. Final Capital ${run.wallet.cash}C.`);
      break;
    case 'lost':
      lines.push(`RUN OVER: ${where} ended with Sales $${run.sales} of $${run.target}.`);
      break;
  }
  if (run.phase === 'won' || run.phase === 'lost') {
    lines.push('', 'Legal actions:', ...legalActions(run).map((a) => `  ${a}`));
    return lines.join('\n');
  }

  lines.push('', ...marketLines(run));
  const boards = run.upcomingBoards();
  if (boards.length > 0) lines.push(`Board Reviews ahead: ${boards.map((b) => `${quarterLabel(run, b.round)} (round ${b.round}): ${b.boss.name}: ${b.boss.text}`).join(' | ')}`);

  lines.push('', run.phase === 'shift' ? 'Line (the Batch runs left to right from 0 Units, Margin $2):' : 'Line Fixtures:');
  run.line.forEach((slot, i) => {
    const fixture = run.isWelded(i) && run.phase === 'shift' ? 'WELDED SHUT' : slot.fixture === null ? 'no Fixture' : fixtureText(slot.fixture);
    const held = slot.card === null ? '' : ` | ${cardText(slot.card.card)}${slot.card.loadedShift < run.shift ? ` [parked since Shift ${slot.card.loadedShift}]` : ' [loaded this Shift]'}`;
    lines.push(`  ${i + 1}. ${fixture}${held}`);
  });

  if (run.phase === 'shift') {
    lines.push('', `Hand (${run.hand.length}):`, ...run.hand.map((card, i) => `  ${i + 1}. ${cardText(card)}`));
    lines.push('', 'If you run now:', ...traceLines(run.preview()));
  } else {
    lines.push('', `Shop (reroll ${run.rerollCost}C):`);
    run.offers.forEach((offer, i) => lines.push(`  ${i + 1}. ${offer === null ? '(bought)' : offerText(offer)}`));
    lines.push('', `Deck (${run.deck.length} cards; numbers are for contracts and selling):`, ...run.deck.map((card, i) => `  ${i + 1}. ${cardText(card)}`));
  }
  lines.push('', 'Legal actions:', ...legalActions(run).map((a) => `  ${a}`));
  return lines.join('\n');
}

function marketLines(run: ThroughputRun): string[] {
  const first = run.phase === 'shop' ? run.round + 1 : run.round;
  const lines = [`Market (${run.phase === 'shop' ? 'next round' : 'this round'} and the 3 after):`];
  for (let round = first; round < first + 4 && round <= run.rounds; round++) {
    const trends = run.trends[round - 1];
    if (trends === undefined) continue;
    const pips = round === run.round && run.phase === 'shift' ? ` (${run.hotPipsLeft} buzz pip${run.hotPipsLeft === 1 ? '' : 's'} left)` : '';
    lines.push(`  ${round === run.round && run.phase === 'shift' ? 'now ' : '    '}${quarterLabel(run, round)}: ${trendsText(trends, pips)}`);
  }
  const loyal = run.config.loyalEquity;
  lines.push(`  Equity: ${CATEGORIES.map((c) => `${c} ${run.equity[c]}${run.equity[c] >= loyal ? ' (Loyal)' : ''}`).join(' · ')} (Loyal at ${loyal})`);
  return lines;
}

/** Free `deck` query: every card and what is left to draw this round. */
export function deckText(run: ThroughputRun): string[] {
  const lines = [`Deck (${run.deck.length} cards):`, ...run.deck.map((card, i) => `  ${i + 1}. ${cardText(card)}`)];
  if (run.phase === 'shift') {
    const counts = new Map<string, number>();
    for (const card of run.drawPile) counts.set(cardName(card), (counts.get(cardName(card)) ?? 0) + 1);
    const pile = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
    lines.push(`Left to draw this round (${run.drawPile.length}, order hidden): ${pile.join(', ') || 'nothing'}`);
  }
  return lines;
}

/** JSON-safe snapshot for --json. */
export function stateData(run: ThroughputRun, context: ViewContext): Record<string, unknown> {
  const fixture = (f: Fixture | null) => (f === null ? null : { id: f.def.id, name: f.def.name, kind: f.def.kind, text: f.def.text, roundsOwned: f.roundsOwned });
  const card = (c: Card) => ({ name: cardName(c), id: c.def.id, stage: c.def.stage, category: c.category, effect: cardEffect(c), upgrades: c.upgrades, growth: c.growth });
  const equity: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) equity[c] = run.equity[c];
  return {
    ...context,
    phase: run.phase,
    round: run.round,
    rounds: run.rounds,
    quarter: quarterLabel(run, run.round),
    target: run.target,
    sales: run.sales,
    shift: run.shift,
    capital: run.wallet.cash,
    retoolsLeft: run.retoolsLeft,
    drawPile: run.drawPile.length,
    discardPile: run.discardPile.length,
    stored: run.stored,
    hotPipsLeft: run.hotPipsLeft,
    boss: run.boss === null ? null : { name: run.boss.name, text: run.boss.text },
    market: run.trends.slice(run.round - 1, run.round + 3).map((trends, i) => ({ round: run.round + i, trends })),
    equity,
    boards: run.upcomingBoards().map((b) => ({ round: b.round, boss: b.boss.name, text: b.boss.text })),
    line: run.line.map((slot, i) => ({
      slot: i + 1,
      welded: run.isWelded(i),
      fixture: fixture(slot.fixture),
      card: slot.card === null ? null : { ...card(slot.card.card), loadedShift: slot.card.loadedShift },
    })),
    hand: run.phase === 'shift' ? run.hand.map(card) : [],
    preview: run.phase === 'shift' ? previewData(run.preview()) : null,
    lastShift: run.lastShift === null ? null : previewData(run.lastShift),
    payout: run.lastPayout,
    shop: run.phase === 'shop' ? { rerollCost: run.rerollCost, offers: run.offers.map((o) => (o === null ? null : { kind: o.kind, text: offerText(o), price: o.price })) } : null,
    deck: run.deck.map(card),
    legalActions: legalActions(run),
  };
}

function previewData(result: ShiftResult) {
  return { steps: result.steps, leftover: result.leftover, storedUnits: result.storedUnits, overstockSales: result.overstockSales, total: result.total };
}
