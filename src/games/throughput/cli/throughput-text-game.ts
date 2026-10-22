import { ReplayTextGame } from '../../../play/session';
import type { GameView, ReplayStep, SaveFile } from '../../../play/session';
import type { ThroughputConfig } from '../content';
import { cardName } from '../model';
import type { Card } from '../model';
import { ThroughputRun } from '../rules';
import type { BuyTarget } from '../rules';
import { formatAction, parseAction } from './actions';
import type { ThroughputAction } from './actions';
import { RULES_TEXT } from './rules-text';
import { deckText, formatView, legalActions, quarterLabel, stateData, traceLines } from './text-view';

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

function buyTarget(run: ThroughputRun, offer: number, target: number | null): BuyTarget | string {
  const item = run.offers[offer];
  if (target === null || item == null) return {};
  if (item.kind === 'fixture') return { slot: target };
  if (item.kind === 'contract' && item.def.targetsCard) return { deckCard: target };
  return `${item.def.name} takes no target; use "buy ${offer + 1}"`;
}

function whyCannot(run: ThroughputRun, action: ThroughputAction): string | null {
  switch (action.verb) {
    case 'load':
      return run.whyCannotLoad(action.placements);
    case 'unload':
      return run.whyCannotUnload(action.slots);
    case 'scrap':
      return run.whyCannotScrap(action.slots);
    case 'retool':
      return run.whyCannotRetool(action.hand);
    case 'run':
      return run.whyCannotRun();
    case 'buy': {
      const target = buyTarget(run, action.offer, action.target);
      return typeof target === 'string' ? target : run.whyCannotBuy(action.offer, target);
    }
    case 'sell':
      return action.what === 'fixture' ? run.whyCannotSellFixture(action.index) : run.whyCannotSellCard(action.index);
    case 'move':
      return run.whyCannotMove(action.from, action.to);
    case 'reroll':
      return run.whyCannotReroll();
    case 'continue':
      return run.whyCannotContinue();
    case 'rules':
    case 'deck':
      return null;
  }
}

/** Applies a legal action and returns what happened, as log lines. */
function apply(run: ThroughputRun, action: ThroughputAction): string[] {
  switch (action.verb) {
    case 'load': {
      const names = action.placements.map((p) => `${nameOf(run.hand[p.hand])} → slot ${p.slot + 1}`);
      run.load(action.placements);
      return [`Loaded ${names.join(', ')}.`];
    }
    case 'unload': {
      const names = action.slots.map((s) => nameOf(run.line[s]?.card?.card));
      run.unload(action.slots);
      return [`Back in hand: ${names.join(', ')}.`];
    }
    case 'scrap': {
      const names = action.slots.map((s) => nameOf(run.line[s]?.card?.card));
      run.scrap(action.slots);
      return [`Scrapped ${names.join(', ')}.`];
    }
    case 'retool': {
      const names = action.hand.map((h) => nameOf(run.hand[h]));
      const before = run.hand.length - action.hand.length;
      run.retool(action.hand);
      const drawn = run.hand.slice(before).map(cardName);
      return [`Retooled ${names.join(', ')}; drew ${drawn.length > 0 ? drawn.join(', ') : 'nothing (the draw pile is empty)'}.`];
    }
    case 'run':
      return runLog(run);
    case 'buy': {
      const target = buyTarget(run, action.offer, action.target) as BuyTarget;
      const item = run.buy(action.offer, target);
      const where = item.kind === 'fixture' ? ` into slot ${(target.slot ?? 0) + 1}` : item.kind === 'card' ? ' into your deck' : '';
      return [`Bought ${item.kind === 'card' ? `${item.def.name}-${item.category.charAt(0)}` : item.def.name} for ${item.price}C${where}. Capital ${run.wallet.cash}C.`];
    }
    case 'sell': {
      const name = action.what === 'fixture' ? run.line[action.index]?.fixture?.def.name : nameOf(run.deck[action.index]);
      const refund = action.what === 'fixture' ? run.sellFixture(action.index) : run.sellCard(action.index);
      return [`Sold ${name ?? ''} for ${refund}C. Capital ${run.wallet.cash}C.`];
    }
    case 'move':
      run.moveFixture(action.from, action.to);
      return [`Moved the Fixture in slot ${action.from + 1} to slot ${action.to + 1}. Capital ${run.wallet.cash}C.`];
    case 'reroll':
      run.reroll();
      return [`Rerolled. Next reroll ${run.rerollCost}C.`];
    case 'continue':
      run.continueToNextRound();
      return [`${quarterLabel(run, run.round)} begins: target $${run.target}.`];
    case 'rules':
      return [RULES_TEXT];
    case 'deck':
      return deckText(run);
  }
}

function runLog(run: ThroughputRun): string[] {
  const round = run.round;
  const shift = run.shift;
  const target = run.target;
  const result = run.runShift();
  const lines = [`Shift ${shift}:`, ...traceLines(result)];
  const extras: string[] = [];
  if (result.hotPipUsed) extras.push('a Hot buzz pip was used');
  if (result.equityGained.length > 0) extras.push(`+1 Equity for ${result.equityGained.join(', ')}`);
  if (result.grown.length > 0) extras.push(`R&D growth: ${result.grown.map(cardName).join(', ')}`);
  if (extras.length > 0) lines.push(`  ${extras.join('; ')}.`);
  lines.push(`Round sales $${run.sales} of $${target}.`);
  switch (run.phase) {
    case 'shop':
      lines.push(`Target hit! ${quarterLabel(run, round)} cleared. Payout: ${(run.lastPayout ?? []).map((l) => `${l.source} ${l.amount}C`).join(', ')}.`);
      break;
    case 'won':
      lines.push('Target hit on the final round. You win!');
      break;
    case 'lost':
      lines.push('Missed the target after the last Shift. The run is over.');
      break;
    case 'shift':
      lines.push(`Make and Ship cards dispatched${run.boss?.designsStay() === false ? ' (Turnover: Designs too)' : '; Designs stay'}. Drew back up to ${run.hand.length}.`);
      break;
  }
  return lines;
}

function nameOf(card: Card | null | undefined): string {
  return card == null ? '?' : cardName(card);
}
