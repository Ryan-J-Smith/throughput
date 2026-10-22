import { PREMIUM_PRICE, SUB_RND_GRADE } from '../model';
import type { BomView, ProductView } from './view';

const MARKET = { small: 'Small', big: 'Big', boss: 'Boss' } as const;
const marketName = (m: string): string => MARKET[m as keyof typeof MARKET] ?? m;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Ten-cell bar of next-Ship Demand against base Demand; it visibly halves on repeat Ships. */
function demandBar(p: ProductView): string {
  const filled = p.demand > 0 ? Math.round((10 * p.nextDemand) / p.demand) : 0;
  return `[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}]`;
}

function productLine(p: ProductView, widths: { id: number; recipe: number }): string {
  const notes = [
    p.shipsThisRun > 0 ? `shipped ${p.shipsThisRound} this round / ${p.shipsThisRun} this run` : '',
    p.growth > 0 ? `+${p.growth} Demand grown` : '',
    p.scale > 0 ? `Scale ${p.scale}` : '',
    p.premium > 0 ? `Premium ${p.premium}` : '',
  ].filter(Boolean);
  const demand = `Demand ${p.nextDemand}/${p.demand} ${demandBar(p)}`;
  return `  ${p.id.padEnd(widths.id)}  ${p.recipe.padEnd(widths.recipe)}  ${String(p.units).padStart(3)} Units  $${String(p.price).padEnd(3)} ${demand}${notes.length ? `  ${notes.join(', ')}` : ''}`;
}

/** "most-shipped: desk-fan (4 ships)" for Recall, from run ship counts (ties listed together). */
function recallLeader(v: BomView): string {
  const most = Math.max(0, ...v.products.map((p) => p.shipsThisRun));
  if (most === 0) return 'nothing shipped yet';
  const ids = v.products.filter((p) => p.shipsThisRun === most).map((p) => p.id);
  return `most-shipped now: ${ids.join(', ')} (${most} ship${most > 1 ? 's' : ''})`;
}

function disruptionLine(v: BomView, d: { name: string; text: string }): string {
  return `${d.name} — ${d.text}${d.name === 'Recall' ? ` · ${recallLeader(v)}` : ''}`;
}

/** Compact text of a BoM state, written for an LLM (or human) player. */
export function formatBomView(v: BomView): string {
  const r = v.round;
  const i = v.interest;
  const cash = `Cash $${v.cash} (interest at next clear: $${v.interestNext} — $${i.amount} per $${i.per} held before the payout, max $${i.cap})`;
  const inRound = v.phase === 'round' || v.phase === 'overtime';
  const lines = [
    `Bill of Materials · seed ${v.seed} · ${v.actionsTaken} actions · phase: ${v.phase}`,
    v.phase === 'shop'
      ? `Shop after Q${r.quarter} ${marketName(r.market)} (round ${r.number}/${r.of} cleared with ${r.revenue}/${r.target}) · ${cash}`
      : `Q${r.quarter} ${marketName(r.market)} (round ${r.number}/${r.of}) · Target ${r.target} · Revenue ${r.revenue} · Builds ${v.builds} · Scraps ${v.scraps} · ${cash}`,
  ];
  if (inRound) {
    lines.push(
      `How a Ship scores: Revenue = min(Units, Demand) × Price × multipliers. Every part adds its grade to Units (Motors and other Sub parts too), ` +
        `except Paint, which adds its grade to Price; Premium parts add +$${PREMIUM_PRICE} Price. Ship and Fab each use 1 Build; Scraps are free. ` +
        `At most ${v.rules.maxSelection} parts per Ship or Fab, Bench parts included. Revenue above the target is not paid.`,
    );
  }
  if (r.disruption !== null && inRound) lines.push(`DISRUPTION this round — ${disruptionLine(v, r.disruption)}`);
  // Upcoming Boss disruptions only: a quarter's Boss is round 3 × quarter.
  for (const d of v.disruptions) {
    if (3 * d.quarter > r.number) lines.push(`Q${d.quarter} Boss disruption (revealed): ${disruptionLine(v, d)}`);
  }
  if (v.next !== null) lines.push(`Next: Q${v.next.quarter} ${marketName(v.next.market)} · target ${v.next.target}${v.next.disruption ? ` · disruption ${v.next.disruption}` : ''}`);
  if (v.lastPayout !== null && v.lastPayout.length > 0) {
    lines.push(`Last payout: ${v.lastPayout.map((l) => `${l.source} $${l.amount}`).join(', ')}`);
  }
  if (inRound) {
    lines.push(`Hand (${v.hand.length}) · draw pile ${v.piles.draw} · discard ${v.piles.discard} (reshuffled next round): ${v.hand.map((p) => `${p.ref} ${p.label}`).join(' | ')}`);
    if (v.phase === 'round' && !v.legalActions.some((a) => a.startsWith('ship '))) {
      lines.push('No Product can ship from this hand + Bench (each recipe is listed below). Options: fab a Sub part, or scrap to dig for missing parts.');
    }
  }
  lines.push(`Bench (${v.bench.parts.length}/${v.bench.slots}): ${v.bench.parts.length ? v.bench.parts.map((p) => `${p.ref} ${p.label}`).join(' | ') : '(empty)'}`);

  const widths = { id: Math.max(...v.products.map((p) => p.id.length)), recipe: Math.max(...v.products.map((p) => p.recipe.length)) };
  const halving = v.rules.demandHalves ? 'each repeat Ship of a Product this round halves it' : 'repeat Ships do not halve it (Continuous Production)';
  lines.push(
    `Blueprints ${v.products.length + v.subs.length}/${v.blueprintSlots} (${plural(v.products.length, 'Product')} + ${plural(v.subs.length, 'Sub')}). ` +
      `Demand is shown as next Ship/base: ${halving}. A Product's first Ship each round that sells out (Units ≥ Demand) adds +${v.rules.sellOutGrowth} base Demand permanently.`,
  );
  lines.push('Products:');
  lines.push(...v.products.map((p) => productLine(p, widths)));
  lines.push(`Subs: ${v.subs.map((s) => `${s.id} = ${s.recipe} → ${s.output}, grade 2 × (sum of input grades)${s.rndLevels ? ` +${SUB_RND_GRADE * s.rndLevels} (R&D)` : ''}`).join(' · ') || '(none)'}`);
  lines.push(`Facilities (${v.facilities.length}/${v.facilitySlots}; additive effects, then × multipliers):`);
  lines.push(...(v.facilities.length ? v.facilities.map((f) => `  ${f.name}: ${f.text}`) : ['  (none)']));

  if (v.shop !== null) {
    const s = v.shop;
    lines.push(`Shop (reroll $${s.rerollCost} · shred $${s.shredCost}${s.shredUsed ? ', used' : ''}):`);
    lines.push(...(s.offers.length ? s.offers.map((o) => `  ${o.slot}. ${o.text} · $${o.cost}${o.problem ? ` (${o.problem})` : ''}`) : ['  (sold out)']));
    const deck = Object.entries(s.deck).sort(([a], [b]) => a.localeCompare(b));
    lines.push(`Deck (${deck.reduce((n, [, c]) => n + c, 0)}): ${deck.map(([k, c]) => `${k}×${c}`).join(', ')}`);
  }

  lines.push('Legal actions:');
  lines.push(...(v.legalActions.length ? v.legalActions.map((a) => `  ${a}`) : ['  (none; the run is over)']));
  return lines.join('\n');
}
