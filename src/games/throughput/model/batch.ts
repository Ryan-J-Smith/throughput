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
  sales = 0;
  /** Units waiting in storage that a Warehouse adds to the Batch. */
  stored: number;
  readonly warehouseOpen: boolean;
  /** Set once a Warehouse is reached: leftover Units are stored instead of cleared. */
  storing = false;
  /** Designs that grew (R&D Lab) this Shift, one entry per growth. */
  readonly grown: Card[] = [];
  private events: string[] = [];

  constructor(baseMargin: number, stored: number, warehouseOpen: boolean) {
    this.margin = baseMargin;
    this.stored = stored;
    this.warehouseOpen = warehouseOpen;
  }

  addMargin(amount: number, source: string): void {
    this.margin += amount;
    this.note(`${source} ${amount < 0 ? '-' : '+'}$${formatAmount(Math.abs(amount))}`);
  }

  mulMargin(factor: number, source: string): void {
    this.margin *= factor;
    this.note(`${source} Margin ×${formatAmount(factor)}`);
  }

  addUnits(amount: number, source: string): void {
    this.units += amount;
    this.note(`${source} +${amount} Units`);
  }

  mulUnits(factor: number, source: string): void {
    this.units *= factor;
    this.note(`${source} Units ×${formatAmount(factor)}`);
  }

  mulCaps(factor: number, source: string): void {
    this.capMul *= factor;
    this.note(`${source} later Ship caps ×${formatAmount(factor)}`);
  }

  grow(card: Card, source: string): void {
    this.grown.push(card);
    this.note(`${source}: ${card.def.name} grows +$1`);
  }

  note(event: string): void {
    this.events.push(event);
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
