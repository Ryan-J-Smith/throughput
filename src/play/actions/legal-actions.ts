import type { Run } from '../../engine/run';
import type { Renderer } from '../render';

/** Human/LLM-readable list of the commands that are currently legal, with their costs. */
export function legalActions<TCard>(run: Run<TCard>, renderer: Renderer<TCard>): string[] {
  const out: string[] = [];
  const hand = run.deck.hand.length;
  const pick = `1–${Math.min(run.config.maxSelection, hand)} distinct hand positions (1..${hand})`;
  switch (run.phase) {
    case 'roundStart':
      out.push(`continue — start round ${run.round.number} (target ${run.round.target})`);
      break;
    case 'playing':
      if (run.playsLeft > 0 && hand > 0) out.push(`play <positions…> — score ${pick}; ${run.playsLeft} plays left`);
      if (run.discardsLeft > 0 && hand > 0) out.push(`discard <positions…> — replace ${pick}; ${run.discardsLeft} discards left`);
      break;
    case 'roundEnd':
      out.push('continue — go to the shop');
      break;
    case 'shop':
      run.shop.offers.forEach((offer, i) => {
        if (offer !== null && run.whyCannotBuy(i) === null) {
          const name = offer.def.kind === 'card' ? renderer.cardDef(offer.def) : offer.def.name;
          out.push(`buy ${i + 1} — ${name} for $${offer.price}`);
        }
      });
      if (run.whyCannotReroll() === null) out.push(`reroll — new offers for $${run.shop.rerollCost}`);
      out.push(leaveShopAction(run));
      break;
    default:
      return out;
  }
  run.modifiers.modifiers.forEach((m, i) => {
    if (run.whyCannotSell(m) === null) out.push(`sell ${i + 1} — ${m.name} for $${run.shop.sellValue(m.price)}`);
  });
  return out;
}

function leaveShopAction<TCard>(run: Run<TCard>): string {
  const next = run.peekNextRound();
  if (next === null) return 'continue — leave the shop';
  const boss = next.boss === null ? '' : `, boss ${next.boss.name}`;
  return `continue — leave the shop for round ${next.info.number} (target ${next.info.target}${boss})`;
}
