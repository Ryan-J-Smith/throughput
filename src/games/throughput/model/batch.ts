import type { Card } from './types';

/**
 * The Batch moving down the Line during one Shift. Fixtures and cards change it through these
 * methods so every change lands in the slot's trace.
 */
export class Batch {
  units = 0;
  margin: number;
  /** Multiplier on every later Ship cap (Price Gun). */
  capMul = 1;
  /** Stations passed so far this Shift; every one after the first multiplies Units by less (Megafactory, Assembly Line). */
  stations = 0;
  sales = 0;
  /** The most this Shift's Sales may reach (Quota Cap); Infinity when there is no cap. */
  readonly salesCap: number;
  /** True once a sale stopped at the Shift cap. */
  capReached = false;
  /** What a sale stopped at the cap made past it (the part of its last Unit over the cap), which doesn't count. */
  overCap = 0;
  /** Warehouse stock: sold in a Board Review, added to by a Make card on a Warehouse. */
  stored: number;
  /** Units copied into stock this Shift. */
  stocked = 0;
  readonly warehouseOpen: boolean;
  /** True in a Board Review round (the Warehouse sells its stock). */
  readonly boardReview: boolean;
  /** This Shift's number in the round, from 1. */
  readonly shift: number;
  /** Cards that grew (R&D Lab, Automation) this Shift, one entry per point of growth. */
  readonly grown: Card[] = [];
  /** False when only the numbers matter (bots): events are not recorded. */
  readonly tracing: boolean;
  private events: string[] = [];

  constructor(init: {
    readonly baseMargin: number;
    readonly stored: number;
    readonly warehouseOpen: boolean;
    readonly boardReview: boolean;
    readonly shift: number;
    readonly tracing: boolean;
    readonly salesCap?: number;
  }) {
    this.margin = init.baseMargin;
    this.salesCap = init.salesCap ?? Number.POSITIVE_INFINITY;
    this.stored = init.stored;
    this.warehouseOpen = init.warehouseOpen;
    this.boardReview = init.boardReview;
    this.shift = init.shift;
    this.tracing = init.tracing;
  }

  addMargin(amount: number, source: string): void {
    this.margin += amount;
    if (this.tracing) this.note(`${source} ${amount < 0 ? '-' : '+'}$${formatAmount(Math.abs(amount))}`);
  }

  mulMargin(factor: number, source: string): void {
    this.margin *= factor;
    if (this.tracing) this.note(`${source} Margin ×${formatAmount(factor)}`);
  }

  addUnits(amount: number, source: string): void {
    this.units += amount;
    if (this.tracing) this.note(`${source} +${amount} Units`);
  }

  mulUnits(factor: number, source: string): void {
    this.units *= factor;
    if (this.tracing) this.note(`${source} Units ×${formatAmount(factor)}`);
  }

  mulCaps(factor: number, source: string): void {
    this.capMul *= factor;
    if (this.tracing) this.note(`${source}: Ship caps ×${formatAmount(factor)} from here`);
  }

  /**
   * Sells `units` at `price` each and adds what counts to Sales. Under a Shift cap the sale stops
   * once Sales reach it: only as many Units sell as it takes to get there (the last may count for
   * less than its price), and the rest don't sell at all, so they use no Demand. Returns the Units
   * that sold and the Sales they counted.
   */
  sell(units: number, price: number): { readonly units: number; readonly revenue: number } {
    const full = Math.floor(units * price);
    const room = Math.max(0, this.salesCap - this.sales);
    if (full <= room) {
      this.sales += full;
      return { units, revenue: full };
    }
    this.capReached = true;
    const sold = price > 0 ? Math.min(units, Math.ceil(room / price)) : 0;
    this.overCap += Math.floor(sold * price) - room;
    this.sales += room;
    return { units: sold, revenue: room };
  }

  /** Permanent growth: `points` of +$1 on a Design, or of +1 Unit on a Make. */
  grow(card: Card, source: string, points = 1): void {
    for (let i = 0; i < points; i++) this.grown.push(card);
    if (this.tracing) this.note(`${source}: ${card.def.name} grows ${card.def.stage === 'make' ? `+${points} Units` : `+$${points}`}`);
  }

  note(event: string): void {
    if (this.tracing) this.events.push(event);
  }

  /** Events since the last call, for one slot's trace. */
  takeEvents(): string[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}

/** Up to two decimals, no trailing zeros: 7, 7.5, 1.25. */
export function formatAmount(value: number): string {
  return String(Math.round(value * 100) / 100);
}
