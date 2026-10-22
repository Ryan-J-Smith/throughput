import type { ThroughputConfig } from '../content';
import { Batch, cardName, designAdd, formatAmount, makeUnits, shipCap } from '../model';
import { CATEGORIES } from '../model';
import type { BoardBoss, Card, Category, Fixture, FixtureDef, GrantLevels, TrendStage } from '../model';

export type LineSlot = {
  readonly fixture: Fixture | null;
  readonly card: Card | null;
};

export type Trends = Readonly<Record<Category, TrendStage>>;

/** Everything outside the Line that changes how a Shift scores. */
export type ShiftContext = {
  readonly config: ThroughputConfig;
  readonly trends: Trends;
  /** Each Category's full Demand, and what it still buys this round (its Demand left). */
  readonly demand: Readonly<Record<Category, number>>;
  readonly demandLeft: Readonly<Record<Category, number>>;
  /** R&D Grant levels per Category. */
  readonly grants: Readonly<Record<Category, GrantLevels>>;
  /** Shifts left this round that sell the Hot Category at ×2. */
  readonly hotPipsLeft: number;
  /** Units in storage before the Shift. */
  readonly stored: number;
  /** This Shift's number in the round, from 1. */
  readonly shift: number;
  readonly boss: BoardBoss | null;
  /** The most one Shift can count toward round Sales (Quota Cap); null for no limit. */
  readonly shiftCap: number | null;
};

export type SlotTrace = {
  /** 1-based slot number. */
  readonly slot: number;
  /** "[Fixture] Card", "[Station]", "(empty)" or "(welded)". */
  readonly label: string;
  /** The Fixture that ran here; null if none or welded. */
  readonly fixture: FixtureDef | null;
  /** True if the Fixture did nothing for this slot's card (Quality Lab under a Truck). */
  readonly idle: boolean;
  /** The name of the card that ran here; null if none, under a Station, or welded. */
  readonly card: string | null;
  /** True if a boss welded the slot shut. */
  readonly welded: boolean;
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
  /** Units a Warehouse copied into its stock this Shift. */
  readonly stockedUnits: number;
  /** Money from (or, under JIT Auditor, cost of) the leftover Units. */
  readonly overstockSales: number;
  /** Warehouse stock after the Shift. */
  readonly storedAfter: number;
  /** What the Shift counts toward round Sales: Ship sales plus overstock, up to the Shift cap. */
  readonly total: number;
  /** What the Shift made past the Shift cap, which doesn't count (Quota Cap); 0 otherwise. */
  readonly overCap: number;
  /** Designs that grew (R&D Lab), one entry per +$1. */
  readonly grown: readonly Card[];
  readonly hotPipUsed: boolean;
  /** Units each Category's Ship cards sold against its Demand this Shift (Wholesale Club's don't count). */
  readonly demandSold: Readonly<Partial<Record<Category, number>>>;
  /** Categories whose Demand this Shift sold the last of. */
  readonly soldOut: readonly Category[];
  /** Emerging Categories that sold at least 1 Unit this Shift. */
  readonly emergingSold: readonly Category[];
  /** Permanent Demand growth this Shift earns (sell-outs and Emerging sales), from next round. */
  readonly demandGrowth: Readonly<Partial<Record<Category, number>>>;
};

/**
 * Runs one Shift's Batch down the Line, left to right, without changing anything: the returned
 * trace drives the preview, the run and the tests alike. At each slot: handoff, then the
 * fixture, then the card (as many times as the fixture says).
 */
export function scoreLine(line: readonly LineSlot[], ctx: ShiftContext, options: { readonly trace?: boolean } = {}): ShiftResult {
  const { config, boss } = ctx;
  const batch = new Batch({
    baseMargin: config.baseMargin,
    stored: ctx.stored,
    warehouseOpen: boss?.warehouseOpen() ?? true,
    boardReview: boss !== null,
    shift: ctx.shift,
    tracing: options.trace ?? true,
  });
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
    const idle = fixture !== null && card !== null && !fixture.def.effect.appliesTo(card);
    steps.push({
      slot: i + 1,
      label: slotLabel(fixture, card, welded, idle),
      fixture: fixture?.def ?? null,
      idle,
      card: card === null ? null : cardName(card),
      welded,
      events: batch.takeEvents(),
      units: batch.units,
      margin: batch.margin,
      sales: batch.sales,
    });
  });

  const leftover = batch.units;
  const unitValue = boss?.overstockValue(config.overstockValue) ?? config.overstockValue;
  const overstockSales = leftover * unitValue;
  const made = batch.sales + overstockSales;
  const total = ctx.shiftCap === null ? made : Math.min(made, ctx.shiftCap);
  return {
    steps,
    shipSales: batch.sales,
    leftover,
    stockedUnits: batch.stocked,
    overstockSales,
    storedAfter: batch.stored,
    total,
    overCap: made - total,
    grown: batch.grown,
    hotPipUsed: sale.hotUsed,
    demandSold: Object.fromEntries(sale.demandSold),
    soldOut: [...sale.soldOut],
    emergingSold: [...sale.emergingSold],
    demandGrowth: demandGrowth(sale, ctx),
  };
}

/** Trend and Demand effects collected while a Shift's Ship cards sell. */
class SaleState {
  hotUsed = false;
  /** Design card ids that have resolved this Shift (for `repeatMul`). */
  readonly designsRun = new Set<string>();
  readonly demandSold = new Map<Category, number>();
  readonly soldOut = new Set<Category>();
  readonly emergingSold = new Set<Category>();
  readonly ctx: ShiftContext;

  constructor(ctx: ShiftContext) {
    this.ctx = ctx;
  }

  demandSoldOf(category: Category): number {
    return this.demandSold.get(category) ?? 0;
  }
}

/** Sell-outs and Emerging sales grow Demand for good; a sell-out grows it by a share of itself. */
function demandGrowth(sale: SaleState, ctx: ShiftContext): Partial<Record<Category, number>> {
  const { demand } = ctx.config;
  const growth: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) {
    const sellOut = Math.max(demand.sellOutGrowth, Math.ceil(demand.sellOutRate * ctx.demand[c]));
    const amount = (sale.soldOut.has(c) ? sellOut : 0) + (sale.emergingSold.has(c) ? demand.emergingGrowth : 0);
    if (amount > 0) growth[c] = amount;
  }
  return growth;
}

function resolveCard(card: Card, fixture: Fixture | null, batch: Batch, sale: SaleState): void {
  // The slot label already names the card, so its own events name the Stage.
  const def = card.def;
  switch (def.stage) {
    case 'design': {
      const add = designAdd(card);
      if (add !== 0) batch.addMargin(add, 'Design');
      const mul = sale.designsRun.has(def.id) ? (def.repeatMul ?? def.marginMul) : def.marginMul;
      if (mul !== 1 && (sale.ctx.boss?.designMultipliers() ?? true)) batch.mulMargin(mul, 'Design');
      sale.designsRun.add(def.id);
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
  const { config, trends } = sale.ctx;
  const category = card.category;
  const stage = trends[category];
  const grant = sale.ctx.grants[category];
  if (grant.scale > 0) batch.addUnits(config.grant.scaleUnits * grant.scale, 'Scale');
  const base = shipCap(card);
  // Every Ship but Wholesale Club's "all" draws on the Category's Demand, shared across the round.
  const usesDemand = base !== 'all';
  const left = usesDemand ? Math.max(0, sale.ctx.demandLeft[category] - sale.demandSoldOf(category)) : Infinity;
  const cap = base === 'all' ? batch.units : Math.floor((base === 'demand' ? left : base) * batch.capMul);
  const sold = Math.min(batch.units, cap, left);
  const hot = stage === 'hot' && sale.ctx.hotPipsLeft > 0 && sold > 0;
  const flagship = fixture?.def.effect.saleMultiplier(card, fixture, batch) ?? 1;
  const premium = 1 + config.grant.premiumStep * grant.premium;
  const price = batch.margin * marginMul * (hot ? config.hotMultiplier : 1) * flagship * premium;
  const revenue = Math.floor(sold * price);

  batch.units -= sold;
  batch.sales += revenue;
  if (hot) sale.hotUsed = true;
  if (usesDemand && sold > 0) {
    sale.demandSold.set(category, sale.demandSoldOf(category) + sold);
    if (sold === left) sale.soldOut.add(category);
  }
  if (stage === 'emerging' && sold > 0) sale.emergingSold.add(category);
  if (!batch.tracing) return;

  const notes: string[] = [];
  if (typeof base === 'number' && cap !== base) notes.push(`cap ${base}→${cap}`);
  if (base === 'demand' && batch.capMul !== 1) notes.push(`cap ×${formatAmount(batch.capMul)} of Demand`);
  // Demand before → after this sale, so "2" can't be read as what was there before it sold.
  if (usesDemand) notes.push(`${category} Demand ${left}→${left - sold}${sold === left && sold > 0 ? ' sold out' : ''}`);
  if (marginMul !== 1) notes.push(`×${formatAmount(marginMul)}`);
  if (hot) notes.push(`Hot ×${formatAmount(config.hotMultiplier)}`);
  if (flagship !== 1 && fixture !== null) notes.push(`${fixture.def.name} ×${formatAmount(flagship)}`);
  if (premium !== 1) notes.push(`Premium ×${formatAmount(premium)}`);
  batch.note(`Ship sells ${sold} × $${formatAmount(price)} = $${revenue}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`);
}

function slotLabel(fixture: Fixture | null, card: Card | null, welded: boolean, idle: boolean): string {
  if (welded) return '(welded)';
  const parts = [fixture === null ? '' : `[${fixture.def.name}${idle ? ': idle' : ''}]`, card === null ? '' : cardName(card)].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '(empty)';
}
