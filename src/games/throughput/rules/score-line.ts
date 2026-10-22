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
  /**
   * True if the Shift's Sales reached the Shift cap (Quota Cap): from there its sales stopped, so
   * Units past the cap didn't sell, used no Demand or Hot boost, and leftovers cleared for nothing.
   */
  readonly capped: boolean;
  /** What a sale stopped at the cap made past it (part of its last Unit), which doesn't count; 0 otherwise. */
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
    ...(ctx.shiftCap === null ? {} : { salesCap: ctx.shiftCap }),
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
  // Leftovers clear like any sale: past the Shift cap they count for nothing.
  const overstockMade = leftover * unitValue;
  const room = Math.max(0, batch.salesCap - batch.sales);
  const overstockSales = Math.min(overstockMade, room);
  return {
    steps,
    shipSales: batch.sales,
    leftover,
    stockedUnits: batch.stocked,
    overstockSales,
    storedAfter: batch.stored,
    total: batch.sales + overstockSales,
    capped: batch.capReached || overstockMade > room,
    overCap: batch.overCap,
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
  /** How many times each Design card id has resolved this Shift (for `repeatMul`). */
  readonly designsRun = new Map<string, number>();
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
      const before = sale.designsRun.get(def.id) ?? 0;
      // A repeat (another copy, or the same card under Robot Arm) names itself: "2nd Rebrand Margin ×1.5".
      const repeat = before > 0 && def.repeatMul !== undefined;
      const mul = repeat ? (def.repeatMul ?? def.marginMul) : def.marginMul;
      if (mul !== 1 && (sale.ctx.boss?.designMultipliers() ?? true)) batch.mulMargin(mul, repeat ? `${ordinal(before + 1)} ${def.name}` : 'Design');
      sale.designsRun.set(def.id, before + 1);
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
  const wanted = Math.min(batch.units, cap, left);
  const hotReady = stage === 'hot' && sale.ctx.hotPipsLeft > 0 && wanted > 0;
  const flagship = fixture?.def.effect.saleMultiplier(card, fixture, batch) ?? 1;
  const premium = 1 + config.grant.premiumStep * grant.premium;
  const price = batch.margin * marginMul * (hotReady ? config.hotMultiplier : 1) * flagship * premium;
  // Under a Shift cap the sale stops at the cap; the Units it doesn't reach stay in the Batch.
  const { units: sold, revenue } = batch.sell(wanted, price);
  const hot = hotReady && sold > 0;

  batch.units -= sold;
  if (hot) sale.hotUsed = true;
  if (usesDemand && sold > 0) {
    sale.demandSold.set(category, sale.demandSoldOf(category) + sold);
    if (sold === left) sale.soldOut.add(category);
  }
  if (stage === 'emerging' && sold > 0) sale.emergingSold.add(category);
  if (!batch.tracing) return;
  if (sold === 0 && wanted > 0) {
    batch.note(`Ship sells nothing: Sales already reached the $${batch.salesCap} Shift cap (${wanted} Units unsold)`);
    return;
  }

  const notes: string[] = [];
  if (typeof base === 'number' && cap !== base) notes.push(`cap ${base}→${cap}`);
  if (base === 'demand' && batch.capMul !== 1) notes.push(`cap ×${formatAmount(batch.capMul)} of Demand`);
  // Demand before → after this sale, so "2" can't be read as what was there before it sold.
  if (usesDemand) notes.push(`${category} Demand ${left}→${left - sold}${sold === left && sold > 0 ? ' sold out' : ''}`);
  if (marginMul !== 1) notes.push(`×${formatAmount(marginMul)}`);
  if (hot) notes.push(`Hot ×${formatAmount(config.hotMultiplier)}`);
  if (flagship !== 1 && fixture !== null) notes.push(`${fixture.def.name} ×${formatAmount(flagship)}`);
  if (premium !== 1) notes.push(`Premium ×${formatAmount(premium)}`);
  const made = Math.floor(sold * price);
  const stopped = sold < wanted ? `${made > revenue ? ` ($${revenue} counts)` : ''}, reaching the $${batch.salesCap} Shift cap; ${wanted - sold} Units unsold` : '';
  batch.note(`Ship sells ${sold} × $${formatAmount(price)} = $${made}${stopped}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`);
}

/** 2 → "2nd", 3 → "3rd", 11 → "11th". */
function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
}

function slotLabel(fixture: Fixture | null, card: Card | null, welded: boolean, idle: boolean): string {
  if (welded) return '(welded)';
  const parts = [fixture === null ? '' : `[${fixture.def.name}${idle ? ': idle' : ''}]`, card === null ? '' : cardName(card)].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '(empty)';
}
