import type { ThroughputConfig } from '../content';
import { Batch, cardName, designAdd, formatAmount, makeUnits, shipCap } from '../model';
import type { BoardBoss, Card, Category, Fixture, TrendStage } from '../model';

export type LineSlot = {
  readonly fixture: Fixture | null;
  readonly card: Card | null;
};

export type Trends = Readonly<Record<Category, TrendStage>>;

/** Everything outside the Line that changes how a Shift scores. */
export type ShiftContext = {
  readonly config: ThroughputConfig;
  readonly trends: Trends;
  readonly equity: Readonly<Record<Category, number>>;
  /** Shifts left this round that sell the Hot Category at ×2. */
  readonly hotPipsLeft: number;
  /** Units in storage before the Shift. */
  readonly stored: number;
  readonly boss: BoardBoss | null;
};

export type SlotTrace = {
  /** 1-based slot number. */
  readonly slot: number;
  /** "[Fixture] Card", "[Station]", "(empty)" or "(welded)". */
  readonly label: string;
  readonly events: readonly string[];
  readonly units: number;
  readonly margin: number;
  readonly sales: number;
};

export type ShiftResult = {
  readonly steps: readonly SlotTrace[];
  /** Revenue from Ship cards. */
  readonly shipSales: number;
  /** Units left in the Batch after the last slot. */
  readonly leftover: number;
  /** Units of the leftover moved into storage. */
  readonly storedUnits: number;
  /** Money from (or, under JIT Auditor, cost of) leftover Units that were not stored. */
  readonly overstockSales: number;
  /** Units in storage after the Shift. */
  readonly storedAfter: number;
  readonly total: number;
  /** Designs that grew (R&D Lab), one entry per +$1. */
  readonly grown: readonly Card[];
  readonly hotPipUsed: boolean;
  /** Emerging Categories that shipped this Shift (each gains +1 Equity). */
  readonly equityGained: readonly Category[];
};

/**
 * Runs one Shift's Batch down the Line, left to right, without changing anything: the returned
 * trace drives the preview, the run and the tests alike. At each slot: handoff, then the
 * fixture, then the card (as many times as the fixture says).
 */
export function scoreLine(line: readonly LineSlot[], ctx: ShiftContext, options: { readonly trace?: boolean } = {}): ShiftResult {
  const { config, boss } = ctx;
  const batch = new Batch(config.baseMargin, ctx.stored, boss?.warehouseOpen() ?? true, options.trace ?? true);
  const sale = new SaleState(ctx);
  const chain: (Card | null)[] = [];
  const steps: SlotTrace[] = [];

  line.forEach((slot, i) => {
    const welded = boss?.isWelded(i) ?? false;
    const fixture = welded ? null : slot.fixture;
    const card = welded || fixture?.def.kind === 'station' ? null : slot.card;
    const previous = [chain[i - 1] ?? null, chain[i - 2] ?? null];

    if (welded) batch.note('Welded shut');
    if (card !== null && previous[0]?.category === card.category) batch.addMargin(1, 'Handoff');
    fixture?.def.effect.onSlot(batch, { card, previous });
    if (card !== null) {
      const times = fixture?.def.effect.resolveCount(card) ?? 1;
      for (let t = 0; t < times; t++) {
        resolveCard(card, fixture, batch, sale);
        fixture?.def.effect.afterResolve(card, batch);
      }
    }
    chain.push(card);
    steps.push({
      slot: i + 1,
      label: slotLabel(fixture, card, welded),
      events: batch.takeEvents(),
      units: batch.units,
      margin: batch.margin,
      sales: batch.sales,
    });
  });

  const leftover = batch.units;
  const storedUnits = batch.storing ? Math.min(leftover, config.warehouseCap) : 0;
  const unitValue = boss?.overstockValue(config.overstockValue) ?? config.overstockValue;
  const overstockSales = (leftover - storedUnits) * unitValue;
  return {
    steps,
    shipSales: batch.sales,
    leftover,
    storedUnits,
    overstockSales,
    storedAfter: batch.storing ? storedUnits : batch.stored,
    total: batch.sales + overstockSales,
    grown: batch.grown,
    hotPipUsed: sale.hotUsed,
    equityGained: [...sale.equityGained],
  };
}

/** Trend effects collected while a Shift's Ship cards sell. */
class SaleState {
  hotUsed = false;
  readonly equityGained = new Set<Category>();
  readonly ctx: ShiftContext;

  constructor(ctx: ShiftContext) {
    this.ctx = ctx;
  }
}

function resolveCard(card: Card, fixture: Fixture | null, batch: Batch, sale: SaleState): void {
  // The slot label already names the card, so its own events name the Stage.
  const def = card.def;
  switch (def.stage) {
    case 'design': {
      const add = designAdd(card);
      if (add !== 0) batch.addMargin(add, 'Design');
      if (def.marginMul !== 1) batch.mulMargin(def.marginMul, 'Design');
      return;
    }
    case 'make':
      batch.addUnits(makeUnits(card), 'Make');
      if (def.marginAdd !== 0) batch.addMargin(def.marginAdd, 'Make');
      return;
    case 'ship':
      ship(card, def.marginMul, fixture, batch, sale);
      return;
  }
}

function ship(card: Card, marginMul: number, fixture: Fixture | null, batch: Batch, sale: SaleState): void {
  const { config, trends, equity } = sale.ctx;
  const category = card.category;
  const stage = trends[category];
  const saturated = stage === 'saturated' && equity[category] < config.loyalEquity;
  const base = shipCap(card);
  const cap = base === 'all' ? batch.units : Math.floor(base * batch.capMul * (saturated ? config.saturatedCapMul : 1));
  const sold = Math.min(batch.units, cap);
  const hot = stage === 'hot' && sale.ctx.hotPipsLeft > 0 && sold > 0;
  const flagship = fixture?.def.effect.saleMultiplier(card, fixture) ?? 1;
  const price = (batch.margin + equity[category]) * marginMul * (hot ? config.hotMultiplier : 1) * flagship;
  const revenue = Math.floor(sold * price);

  batch.units -= sold;
  batch.sales += revenue;
  if (hot) sale.hotUsed = true;
  if (stage === 'emerging' && sold > 0) sale.equityGained.add(category);
  if (!batch.tracing) return;

  const notes: string[] = [];
  if (base !== 'all' && cap !== base) notes.push(`cap ${base}→${cap}${saturated ? ' (Saturated)' : ''}`);
  if (equity[category] > 0) notes.push(`Equity +$${equity[category]}`);
  if (marginMul !== 1) notes.push(`×${formatAmount(marginMul)}`);
  if (hot) notes.push(`Hot ×${formatAmount(config.hotMultiplier)}`);
  if (flagship !== 1) notes.push(`Flagship ×${formatAmount(flagship)}`);
  batch.note(`Ship sells ${sold} × $${formatAmount(price)} = $${revenue}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`);
}

function slotLabel(fixture: Fixture | null, card: Card | null, welded: boolean): string {
  if (welded) return '(welded)';
  const parts = [fixture === null ? '' : `[${fixture.def.name}]`, card === null ? '' : cardName(card)].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '(empty)';
}
