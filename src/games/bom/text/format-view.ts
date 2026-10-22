import type { BomView, ProductView } from './view';

const MARKET = { small: 'Small', big: 'Big', boss: 'Boss' } as const;
const marketName = (m: string): string => MARKET[m as keyof typeof MARKET] ?? m;

/** Ten-cell bar of next-Ship Demand against base Demand; it visibly halves on repeat Ships. */
function demandBar(p: ProductView): string {
  const filled = p.demand > 0 ? Math.round((10 * p.nextDemand) / p.demand) : 0;
  return `[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}]`;
}

function productLine(p: ProductView, widths: { id: number; recipe: number }): string {
  const notes = [
    p.shipsThisRound > 0 ? `shipped ×${p.shipsThisRound}` : '',
    p.growth > 0 ? `+${p.growth} Demand grown` : '',
    p.scale > 0 ? `Scale ${p.scale}` : '',
    p.premium > 0 ? `Premium ${p.premium}` : '',
  ].filter(Boolean);
  const demand = `Demand ${p.nextDemand}/${p.demand} ${demandBar(p)}`;
  return `  ${p.id.padEnd(widths.id)}  ${p.recipe.padEnd(widths.recipe)}  ${String(p.units).padStart(3)} Units  $${String(p.price).padEnd(3)} ${demand}${notes.length ? `  ${notes.join(', ')}` : ''}`;
}

/** Compact text of a BoM state, written for an LLM (or human) player. */
export function formatBomView(v: BomView): string {
  const r = v.round;
  const lines = [
    `Bill of Materials · seed ${v.seed} · ${v.actionsTaken} actions · phase: ${v.phase}`,
    v.phase === 'shop'
      ? `Shop after Q${r.quarter} ${marketName(r.market)} (round ${r.number}/${r.of} cleared with ${r.revenue}/${r.target}) · Cash $${v.cash}`
      : `Q${r.quarter} ${marketName(r.market)} (round ${r.number}/${r.of}) · Target ${r.target} · Revenue ${r.revenue} · Builds ${v.builds} · Scraps ${v.scraps} · Cash $${v.cash}`,
  ];
  if (r.disruption !== null && v.phase !== 'shop') lines.push(`DISRUPTION this round — ${r.disruption.name}: ${r.disruption.text}`);
  for (const d of v.disruptions) {
    if (d.quarter >= r.quarter && !(d.quarter === r.quarter && r.market === 'boss' && v.phase !== 'shop')) {
      lines.push(`Q${d.quarter} Boss disruption (revealed): ${d.name} — ${d.text}`);
    }
  }
  if (v.next !== null) lines.push(`Next: Q${v.next.quarter} ${marketName(v.next.market)} · target ${v.next.target}${v.next.disruption ? ` · disruption ${v.next.disruption}` : ''}`);
  if (v.lastPayout !== null && v.lastPayout.length > 0) {
    lines.push(`Last payout: ${v.lastPayout.map((l) => `${l.source} $${l.amount}`).join(', ')}`);
  }
  if (v.hand.length > 0 && v.phase !== 'shop') lines.push(`Hand: ${v.hand.map((p) => `${p.ref} ${p.label}`).join(' | ')}`);
  lines.push(`Bench (${v.bench.parts.length}/${v.bench.slots}): ${v.bench.parts.length ? v.bench.parts.map((p) => `${p.ref} ${p.label}`).join(' | ') : '(empty)'}`);

  const widths = { id: Math.max(...v.products.map((p) => p.id.length)), recipe: Math.max(...v.products.map((p) => p.recipe.length)) };
  lines.push(`Products (${v.products.length + v.subs.length}/${v.blueprintSlots} blueprints; Demand = next Ship / base):`);
  lines.push(...v.products.map((p) => productLine(p, widths)));
  lines.push(`Subs: ${v.subs.map((s) => `${s.id} = ${s.recipe} → ${s.output} grade 2×inputs${s.rndLevels ? ` +${3 * s.rndLevels} (R&D)` : ''}`).join(' · ')}`);
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
