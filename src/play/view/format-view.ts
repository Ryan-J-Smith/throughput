import type { StateView } from './state-view';

/** Compact multi-line text of a state view, written for an LLM player to read. */
export function formatView(view: StateView): string {
  const r = view.round;
  const lines = [
    `${view.game} · seed ${view.seed} · ${view.actionsTaken} actions · phase: ${view.phase}`,
    `Round ${r.number}/${r.of}${r.isBoss ? ' (BOSS)' : ''} · target ${r.target} · score ${r.score}`,
  ];
  if (r.boss !== null) lines.push(`Boss: ${r.boss}`);
  const counters = view.phase === 'playing' ? `Plays ${view.plays} · Discards ${view.discards} · ` : '';
  const piles = view.phase === 'playing' ? ` · Draw pile ${view.drawPile} · Discard pile ${view.discardPile}` : '';
  lines.push(`${counters}Cash $${view.cash} · Hand size ${view.handSize}${piles}`);
  if (view.next !== null) {
    const n = view.next;
    lines.push(`Next: round ${n.number}/${r.of}${n.isBoss ? ' (BOSS)' : ''} · target ${n.target}${n.boss === null ? '' : ` · boss: ${n.boss}`}`);
  }
  if (view.payout !== null && view.payout.length > 0) {
    lines.push(`Last payout: ${view.payout.map((l) => `${l.source} $${l.amount}`).join(', ')}`);
  }
  if (view.hand.length > 0) {
    lines.push('Hand:', ...view.hand.map((h) => `  ${h.position}. ${h.card}`));
  }
  lines.push(`Modifiers (${view.modifiers.length}/${view.modifierSlots}, applied left to right):`);
  if (view.modifiers.length === 0) lines.push('  (none)');
  lines.push(...view.modifiers.map((m) => `  ${m.position}. ${m.text} [sells $${m.sellValue}]`));
  if (view.shop !== null) {
    lines.push(`Shop (reroll $${view.shop.rerollCost}):`);
    if (view.shop.offers.length === 0) lines.push('  (sold out)');
    lines.push(
      ...view.shop.offers.map((o) => `  ${o.slot}. [${o.kind}] ${o.text} · $${o.price}${o.problem === null ? '' : ` (${o.problem})`}`),
    );
  }
  lines.push('Legal actions:');
  lines.push(...(view.legalActions.length > 0 ? view.legalActions.map((a) => `  ${a}`) : ['  (none; the run is over)']));
  return lines.join('\n');
}
