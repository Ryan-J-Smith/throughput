import { ReplayTextGame } from '../../../play/session';
import type { GameView, ReplayStep, SaveFile } from '../../../play/session';
import type { ThroughputConfig } from '../content';
import { cardName } from '../model';
import type { Card } from '../model';
import { ThroughputRun } from '../rules';
import type { BuyTarget, Placement } from '../rules';
import { formatAction, parseAction } from './actions';
import type { ThroughputAction } from './actions';

type BuyAction = Extract<ThroughputAction, { verb: 'buy' }>;
import { rulesText } from './rules-text';
import { deckText, demandUseText, endlessNote, formatView, grownText, legalActions, movesText, offerName, quarterLabel, stateData, traceLines } from './text-view';

/** THROUGHPUT for the text CLI: `npm run -s cli -- new --game throughput --seed N --save FILE`. */
export class ThroughputTextGame extends ReplayTextGame<ThroughputRun> {
  readonly name = 'throughput';
  private readonly config: ThroughputConfig | undefined;

  constructor(config?: ThroughputConfig) {
    super();
    this.config = config;
  }

  protected override start(seed: number): ThroughputRun {
    return new ThroughputRun(seed, this.config);
  }

  protected override step(run: ThroughputRun, text: string): ReplayStep {
    const parsed = parseAction(text);
    if (!parsed.ok) return parsed;
    const action = parsed.action;
    const reason = whyCannot(run, action);
    if (reason !== null) return { ok: false, reason };
    const log = apply(run, action);
    return { ok: true, log, record: action.verb === 'rules' || action.verb === 'deck' ? null : formatAction(action) };
  }

  protected override describe(run: ThroughputRun, save: SaveFile): GameView {
    const context = { game: this.name, seed: save.seed, actionsTaken: save.actions.length };
    return { text: formatView(run, context), legalActions: legalActions(run), state: stateData(run, context) };
  }
}

function buyTarget(run: ThroughputRun, action: BuyAction): BuyTarget | string {
  const { offer, target, grant } = action;
  const item = run.offers[offer];
  if (item == null) return {};
  const grantable = item.kind === 'contract' && item.def.targetsCategory;
  if (grant !== undefined) return grantable ? { category: grant.category, option: grant.option } : `${item.def.name} doesn't take a Category`;
  if (target === null) return {};
  if (item.kind === 'fixture') return { slot: target };
  if (item.kind === 'contract' && item.def.targetsCard) return { deckCard: target };
  if (grantable) return `${item.def.name} needs a Category and scale or premium, e.g. "buy ${offer + 1} home scale"`;
  return `${item.def.name} takes no target; use "buy ${offer + 1}"`;
}

/**
 * The `run.hand` indexes of the cards at these hand numbers (0-based stable positions, as the
 * state lists them), or why one doesn't name a card.
 */
function handIndexes(run: ThroughputRun, numbers: readonly number[]): number[] | string {
  const out: number[] = [];
  for (const [i, n] of numbers.entries()) {
    if (numbers.indexOf(n) !== i) return `Hand card ${n + 1} is named twice`;
    const card = run.handSlots[n];
    if (card == null) return `No hand card ${n + 1}`;
    out.push(run.hand.indexOf(card));
  }
  return out;
}

/** The action's placements with hand numbers turned into `run.hand` indexes, or why that fails. */
function placementsFor(run: ThroughputRun, placements: readonly Placement[]): Placement[] | string {
  const hand = handIndexes(run, placements.map((p) => p.hand));
  return typeof hand === 'string' ? hand : placements.map((p, i) => ({ hand: hand[i] as number, slot: p.slot }));
}

function whyCannot(run: ThroughputRun, action: ThroughputAction): string | null {
  switch (action.verb) {
    case 'load': {
      if (run.phase !== 'shift') return run.whyCannotLoad(action.placements);
      const placements = placementsFor(run, action.placements);
      return typeof placements === 'string' ? placements : run.whyCannotLoad(placements);
    }
    case 'unload':
      return run.whyCannotUnload(action.slots);
    case 'scrap':
      return run.whyCannotScrap(action.slots);
    case 'retool': {
      if (run.phase !== 'shift') return run.whyCannotRetool(action.hand);
      const hand = handIndexes(run, action.hand);
      return typeof hand === 'string' ? hand : run.whyCannotRetool(hand);
    }
    case 'run':
      return run.whyCannotRun();
    case 'buy': {
      const target = buyTarget(run, action);
      return typeof target === 'string' ? target : run.whyCannotBuy(action.offer, target);
    }
    case 'sell':
      return action.what === 'fixture' ? run.whyCannotSellFixture(action.index) : run.whyCannotSellCard(action.index);
    case 'move':
      return run.whyCannotMove(action.from, action.to);
    case 'reroll':
      return run.whyCannotReroll();
    case 'lock':
      return run.whyCannotLock(action.offer);
    case 'unlock':
      return run.whyCannotUnlock();
    case 'continue':
      return run.whyCannotContinue();
    case 'keep going':
      return run.whyCannotKeepGoing();
    case 'rules':
    case 'deck':
      return null;
  }
}

/** Applies a legal action and returns what happened, as log lines. */
function apply(run: ThroughputRun, action: ThroughputAction): string[] {
  switch (action.verb) {
    case 'load': {
      const placements = placementsFor(run, action.placements) as Placement[];
      const names = placements.map((p) => `${nameOf(run.hand[p.hand])} → slot ${p.slot + 1}`);
      run.load(placements);
      return [`Loaded ${names.join(', ')}.`];
    }
    case 'unload': {
      const names = action.slots.map((s) => nameOf(run.line[s]?.card?.card));
      run.unload(action.slots);
      return [`Back in hand: ${names.join(', ')}.`];
    }
    case 'scrap': {
      const names = action.slots.map((s) => `${nameOf(run.line[s]?.card?.card)} (slot ${s + 1} is free)`);
      run.scrap(action.slots);
      return [`Scrapped ${names.join(', ')}.`];
    }
    case 'retool': {
      const hand = handIndexes(run, action.hand) as number[];
      const names = hand.map((h) => nameOf(run.hand[h]));
      const before = new Set(run.hand);
      const restocked = run.restocked;
      run.retool(hand);
      const drawn = drawnText(run, before);
      return [...restockLog(run, restocked), `Retooled ${names.join(', ')}; drew ${drawn === '' ? 'nothing (the draw pile is empty)' : drawn}.`];
    }
    case 'run':
      return runLog(run);
    case 'buy': {
      const target = buyTarget(run, action) as BuyTarget;
      const old = run.offers[action.offer]?.kind === 'fixture' && target.slot !== undefined ? run.line[target.slot]?.fixture : null;
      const refund = target.slot === undefined ? 0 : run.fixtureRefund(target.slot);
      const item = run.buy(action.offer, target);
      const grant = action.grant;
      const where =
        item.kind === 'fixture'
          ? ` into slot ${(target.slot ?? 0) + 1}${old == null ? '' : `, replacing ${old.def.name} (sold for ${refund}C)`}`
          : item.kind === 'card'
            ? ' into your deck'
            : grant !== undefined
              ? `: ${grant.category} ${grant.option === 'scale' ? 'Scale' : 'Premium'} ${run.grants[grant.category][grant.option]}`
              : '';
      const lines = [`Bought ${offerName(item)} for ${item.price}C${where}. Capital ${run.wallet.cash}C.`];
      if (target.slot !== undefined) lines.push(...weldWarning(run, target.slot));
      return lines;
    }
    case 'sell': {
      const name = action.what === 'fixture' ? run.line[action.index]?.fixture?.def.name : nameOf(run.deck[action.index]);
      const refund = action.what === 'fixture' ? run.sellFixture(action.index) : run.sellCard(action.index);
      return [`Sold ${name ?? ''} for ${refund}C. Capital ${run.wallet.cash}C.`];
    }
    case 'move':
      run.moveFixture(action.from, action.to);
      return [`Moved the Fixture in slot ${action.from + 1} to slot ${action.to + 1}. Capital ${run.wallet.cash}C.`, ...weldWarning(run, action.to)];
    case 'reroll': {
      const cost = run.rerollCost;
      const before = run.wallet.cash;
      run.reroll();
      const locked = run.lockedOffer;
      const kept = locked === null ? '' : `; ${offerLabel(run, locked)} stayed, locked`;
      return [`Rerolled for ${cost}C (Capital ${before}C → ${run.wallet.cash}C)${kept}. Next reroll ${run.rerollCost}C.`];
    }
    case 'lock': {
      const moved = run.lockedOffer;
      run.lock(action.offer);
      const unlocked = moved === null ? '' : ` Offer ${moved + 1} is no longer locked.`;
      return [`Locked ${offerLabel(run, action.offer)}: rerolls this visit keep it. Buying it or leaving the shop releases it.${unlocked}`];
    }
    case 'unlock': {
      const label = offerLabel(run, run.lockedOffer ?? 0);
      run.unlock();
      return [`Unlocked ${label}.`];
    }
    case 'continue':
      run.continueToNextRound();
      return [`${quarterLabel(run, run.round)} begins: target $${run.target}.`, ...movesLog(run)];
    case 'keep going': {
      run.keepGoing();
      const next = run.round + 1;
      return [
        `You keep going past the win. After this shop comes ${quarterLabel(run, next)} (target $${run.targetFor(next)}); targets keep climbing ×${run.config.endlessGrowth} a round, a Board Review still ends every Year, and the run ends at the first missed target.`,
      ];
    }
    case 'rules':
      return [rulesText(run.config)];
    case 'deck':
      return deckText(run);
  }
}

function runLog(run: ThroughputRun): string[] {
  const before = new Set(run.hand);
  const restocked = run.restocked;
  const round = run.round;
  const shift = run.shift;
  const target = run.target;
  const result = run.runShift();
  const lines = [`Shift ${shift}:`, ...traceLines(result)];
  const extras: string[] = [];
  if (result.hotPipUsed) extras.push('a Hot buzz pip was used');
  const demand = demandUseText(result, run);
  if (demand !== '') extras.push(`Demand used: ${demand}`);
  if (result.grown.length > 0) extras.push(`grew for good: ${grownText(result.grown)}`);
  if (extras.length > 0) lines.push(`  ${extras.join('; ')}.`);
  lines.push(`Round sales $${run.sales} of $${target}.`);
  switch (run.phase) {
    case 'shop':
      lines.push(`Target hit! ${quarterLabel(run, round)} cleared. Payout: ${(run.lastPayout ?? []).map((l) => `${l.source} ${l.amount}C`).join(', ')}.`);
      break;
    case 'won':
      lines.push('Target hit on the final round. You win! "keep going" plays on past it.');
      break;
    case 'lost':
      lines.push(`Missed the target after the last Shift. The run is over${endlessNote(run)}.`);
      break;
    case 'shift': {
      const drawn = drawnText(run, before);
      lines.push(`Make and Ship cards used up${run.boss?.designsStay() === false ? ' (Turnover: Designs too)' : '; Designs stay'}.`);
      lines.push(...restockLog(run, restocked));
      lines.push(drawn === '' ? `Drew nothing (the draw pile is empty); ${run.hand.length} cards in hand.` : `Drew ${drawn}.`);
      lines.push(...movesLog(run));
      break;
    }
  }
  return lines;
}

/** A log line if a Restock happened since the round's Restock count was `before`. */
function restockLog(run: ThroughputRun, before: number): string[] {
  const cards = run.restocked - before;
  return cards > 0 ? [`Restock: the draw pile ran out, so ${cards} discards were shuffled into a new draw pile.`] : [];
}

/** The cards now in hand that weren't in `before`, with their hand numbers: "Truck-G (3), Sketch-A (5)". */
function drawnText(run: ThroughputRun, before: ReadonlySet<Card>): string {
  return run.handSlots.flatMap((card, i) => (card === null || before.has(card) ? [] : [`${cardName(card)} (${i + 1})`])).join(', ');
}

/** A log line for Fixtures the boss moved at the start of this Shift. */
function movesLog(run: ThroughputRun): string[] {
  if (run.phase !== 'shift' || run.fixtureMoves.length === 0) return [];
  return [`${run.boss?.name ?? 'The boss'}: Fixtures moved before Shift ${run.shift}: ${movesText(run.fixtureMoves)}.`];
}

/** Warns when a Board Review ahead welds the slot a Fixture just went into. */
function weldWarning(run: ThroughputRun, slot: number): string[] {
  return run
    .upcomingBoards()
    .filter((b) => b.round > run.round && b.boss.isWelded(slot))
    .map((b) => `Note: ${quarterLabel(run, b.round)} (round ${b.round}) ${b.boss.name} welds slot ${slot + 1}, and its Fixture does nothing that round.`);
}

/** "offer 3 (Influencer-G)". */
function offerLabel(run: ThroughputRun, index: number): string {
  const offer = run.offers[index];
  return `offer ${index + 1}${offer == null ? '' : ` (${offerName(offer)})`}`;
}

function nameOf(card: Card | null | undefined): string {
  return card == null ? '?' : cardName(card);
}
