import type { Run, RunPhase } from '../../engine/run';
import type { ScoreContribution } from '../../engine/scoring';
import type { Renderer } from '../render';
import type { PlayerAction } from './player-action';

export type ActionOutcome = { readonly ok: true; readonly log: readonly string[] } | { readonly ok: false; readonly reason: string };

/**
 * Validates `action` with the run's `whyCannot…` queries and applies it if legal.
 * Returns a concise log of what happened (scoring steps, draws, payouts) or the reason it was refused.
 * A refused action leaves the run untouched.
 */
export function applyAction<TCard>(run: Run<TCard>, action: PlayerAction, renderer: Renderer<TCard>): ActionOutcome {
  switch (action.kind) {
    case 'play':
    case 'discard': {
      const cards = handCards(run, action.positions);
      if (typeof cards === 'string') return refuse(cards);
      const problem = action.kind === 'play' ? run.whyCannotPlay(cards) : run.whyCannotDiscard(cards);
      if (problem !== null) return refuse(problem);
      return action.kind === 'play' ? play(run, cards, renderer) : discard(run, cards, renderer);
    }
    case 'buy': {
      const slot = action.slot - 1;
      const problem = run.whyCannotBuy(slot);
      if (problem !== null) return refuse(problem);
      const offer = run.buy(slot);
      const name = offer.def.kind === 'card' ? renderer.cardDef(offer.def) : renderer.modifierDef(offer.def);
      return done(`Bought ${name} for $${offer.price} (cash $${run.wallet.cash})`);
    }
    case 'sell': {
      const modifier = run.modifiers.modifiers[action.position - 1];
      if (modifier === undefined) return refuse(`No modifier in slot ${action.position}`);
      const problem = run.whyCannotSell(modifier);
      if (problem !== null) return refuse(problem);
      const value = run.sell(modifier);
      return done(`Sold ${modifier.name} for $${value} (cash $${run.wallet.cash})`);
    }
    case 'reroll': {
      const problem = run.whyCannotReroll();
      if (problem !== null) return refuse(problem);
      const cost = run.shop.rerollCost;
      run.reroll();
      return done(`Rerolled for $${cost} (cash $${run.wallet.cash}; next reroll $${run.shop.rerollCost})`);
    }
    case 'continue':
      return advance(run, renderer);
  }
}

function play<TCard>(run: Run<TCard>, cards: readonly TCard[], renderer: Renderer<TCard>): ActionOutcome {
  const before = [...run.deck.hand];
  const result = run.play(cards);
  const log = [`Played: ${cards.map((c) => renderer.card(c)).join(', ')}`];
  log.push(...result.score.log.map((c) => `  ${formatContribution(c)}`));
  log.push(`Play scored ${result.total}; round ${run.roundScore}/${run.round.target}`);
  log.push(...roundOutcome(run, renderer, without(before, cards)));
  return { ok: true, log };
}

function discard<TCard>(run: Run<TCard>, cards: readonly TCard[], renderer: Renderer<TCard>): ActionOutcome {
  const before = [...run.deck.hand];
  run.discard(cards);
  const log = [`Discarded: ${cards.map((c) => renderer.card(c)).join(', ')} (${run.discardsLeft} discards left)`];
  log.push(...roundOutcome(run, renderer, without(before, cards)));
  return { ok: true, log };
}

/** What happened after a play/discard: new cards drawn, or how the round ended. */
function roundOutcome<TCard>(run: Run<TCard>, renderer: Renderer<TCard>, kept: readonly TCard[]): string[] {
  switch (run.phase) {
    case 'playing': {
      const drawn = without(run.deck.hand, kept);
      return [drawn.length > 0 ? `Drew: ${drawn.map((c) => renderer.card(c)).join(', ')}` : 'Drew nothing (draw pile empty)'];
    }
    case 'roundEnd':
    case 'won': {
      const lines = run.payout?.lines ?? [];
      const items = lines.map((l) => `${l.source} $${l.amount}`).join(', ');
      const out = [`Round ${run.round.number} cleared! Payout: ${items || 'nothing'} (cash $${run.wallet.cash})`];
      if (run.phase === 'won') out.push(`RUN WON after ${run.config.rounds} rounds`);
      return out;
    }
    case 'lost':
      return [`Round ${run.round.number} failed at ${run.roundScore}/${run.round.target}. RUN LOST`];
    default:
      return [];
  }
}

function advance<TCard>(run: Run<TCard>, renderer: Renderer<TCard>): ActionOutcome {
  switch (run.phase) {
    case 'setup':
      run.start();
      return done('Run started');
    case 'roundStart': {
      run.startRound();
      const boss = run.boss === null ? '' : `; boss: ${renderer.boss(run.boss)}`;
      const log = [`Round ${run.round.number} started: target ${run.round.target}${boss}`];
      if (currentPhase(run) === 'lost') log.push('No cards to draw. RUN LOST');
      return { ok: true, log };
    }
    case 'roundEnd':
      run.enterShop();
      return done(`Entered the shop (cash $${run.wallet.cash})`);
    case 'shop':
      run.leaveShop();
      return done(`Left the shop; next is round ${run.round.number}, target ${run.round.target}${run.boss ? `, boss ${run.boss.name}` : run.round.isBoss ? ' (boss)' : ''}`);
    case 'playing':
      return refuse('Round in progress: play or discard cards');
    case 'won':
    case 'lost':
      return refuse('The run is over');
  }
}

/** Resolves 1-based hand positions to cards, or explains which position is invalid. */
function handCards<TCard>(run: Run<TCard>, positions: readonly number[]): TCard[] | string {
  const hand = run.deck.hand;
  const cards: TCard[] = [];
  for (const position of positions) {
    const card = hand[position - 1];
    if (card === undefined) return `No card at hand position ${position} (hand has ${hand.length})`;
    cards.push(card);
  }
  return cards;
}

export function formatContribution(c: ScoreContribution): string {
  const op = c.op === 'add' ? `${c.amount >= 0 ? '+' : ''}${num(c.amount)}` : c.op === 'multiply' ? `×${num(c.amount)}` : `= ${num(c.amount)}`;
  return `${c.source}: ${c.stat} ${op} → ${num(c.after)}`;
}

/** Re-reads the phase after an action changed it (TS narrowing can't see that). */
const currentPhase = <TCard>(run: Run<TCard>): RunPhase => run.phase;
const num = (n: number): string => String(Math.round(n * 100) / 100);
const done = (line: string): ActionOutcome => ({ ok: true, log: [line] });
const refuse = (reason: string): ActionOutcome => ({ ok: false, reason });

/** `items` minus one occurrence (by identity) of each of `remove`. */
function without<T>(items: readonly T[], remove: readonly T[]): T[] {
  const out = [...items];
  for (const item of remove) {
    const i = out.indexOf(item);
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}
