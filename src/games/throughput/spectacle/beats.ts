import { DEFAULT_CONFIG } from '../content';
import type { ShiftResult, SlotTrace } from '../rules';

/** A moment in a slot worth its own flourish on the belt. */
export type Flourish = 'design' | 'make' | 'sale' | 'hot' | 'sold-out' | 'retrigger' | 'price-gun' | 'welded';

/** One slot of a Shift as the replay shows it: who is there, what the Batch is after it, and the flourishes. */
export type Beat = {
  /** 1-based slot number. */
  readonly slot: number;
  readonly kind: 'card' | 'fixture' | 'empty' | 'welded';
  /** The Fixture's name. */
  readonly fixture: string | null;
  readonly fixtureKind: 'mod' | 'station' | null;
  /** The Fixture here does nothing for this card. */
  readonly idle: boolean;
  readonly card: string | null;
  /** The Batch after this slot. */
  readonly units: number;
  readonly margin: number;
  readonly sales: number;
  /** What this slot changed: Units can go down when a Ship sells them. */
  readonly unitsDelta: number;
  readonly marginDelta: number;
  readonly earned: number;
  readonly flourishes: readonly Flourish[];
  readonly events: readonly string[];
};

export type ShiftBeats = {
  readonly beats: readonly Beat[];
  readonly leftover: number;
  /** Units a Warehouse copied into stock this Shift. */
  readonly stored: number;
  /** Leftover Units, cleared at the overstock value. */
  readonly cleared: number;
  readonly overstockSales: number;
  readonly total: number;
  /** True if the Shift's Sales stopped at a Board's Shift cap (Quota Cap), so the finale can say so. */
  readonly capped: boolean;
  /** What the sale that hit the cap made past it; already out of `total`. */
  readonly overCap: number;
};

/** Fixtures that make the card here resolve more than once. */
const RETRIGGERS: ReadonlySet<string> = new Set(['robot-arm', 'robotics-cell']);

function who(step: SlotTrace): Pick<Beat, 'kind' | 'fixture' | 'fixtureKind' | 'idle' | 'card'> {
  const kind = step.welded ? 'welded' : step.card !== null ? 'card' : step.fixture !== null ? 'fixture' : 'empty';
  return { kind, fixture: step.fixture?.name ?? null, fixtureKind: step.fixture?.kind ?? null, idle: step.idle, card: step.card };
}

function retriggers(step: SlotTrace): boolean {
  return step.fixture !== null && !step.idle && step.card !== null && RETRIGGERS.has(step.fixture.id);
}

function flourishesOf(beat: Omit<Beat, 'flourishes'>, retrigger: boolean): Flourish[] {
  const out: Flourish[] = [];
  const said = (text: string) => beat.events.some((e) => e.includes(text));
  if (beat.kind === 'welded') out.push('welded');
  if (beat.marginDelta > 0) out.push('design');
  if (beat.unitsDelta > 0) out.push('make');
  if (beat.earned > 0) out.push('sale');
  if (said('Hot ×')) out.push('hot');
  if (said('sold out')) out.push('sold-out');
  if (said('Price Gun')) out.push('price-gun');
  if (retrigger) out.push('retrigger');
  return out;
}

/**
 * Turns a Shift's trace into the beats the belt replay plays, one per slot, plus the leftover
 * finale. `baseMargin` is the Margin the Batch starts with (the run's config).
 */
export function shiftBeats(result: ShiftResult, baseMargin = DEFAULT_CONFIG.baseMargin): ShiftBeats {
  let before: Pick<SlotTrace, 'units' | 'margin' | 'sales'> = { units: 0, margin: baseMargin, sales: 0 };
  const beats = result.steps.map((step) => {
    const partial = {
      slot: step.slot,
      ...who(step),
      units: step.units,
      margin: step.margin,
      sales: step.sales,
      unitsDelta: step.units - before.units,
      marginDelta: step.margin - before.margin,
      earned: step.sales - before.sales,
      events: step.events,
    };
    before = step;
    return { ...partial, flourishes: flourishesOf(partial, retriggers(step)) };
  });
  return {
    beats,
    leftover: result.leftover,
    stored: result.stockedUnits,
    cleared: result.leftover,
    overstockSales: result.overstockSales,
    total: result.total,
    capped: result.capped,
    overCap: result.overCap,
  };
}
