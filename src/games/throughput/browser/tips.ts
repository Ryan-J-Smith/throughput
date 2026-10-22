import type { KeyValueStore } from '../../../ui/storage';
import type { ShiftResult, ThroughputRun } from '../rules';

/** First-run tips, in the order a new player meets them. */
export const TIP_IDS = ['load', 'run', 'shop'] as const;
export type TipId = (typeof TIP_IDS)[number];

const KEY = 'throughput.tips';

/**
 * Which tips the player has seen through, kept in the store so each shows once. It reads the
 * store every time, so a reset from Settings reaches a game already on screen.
 */
export class TipMemory {
  private readonly store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  get done(): ReadonlySet<TipId> {
    return new Set(readDone(this.store.get(KEY)));
  }

  /** True once every tip is done (or the player turned tips off). */
  get allDone(): boolean {
    const done = this.done;
    return TIP_IDS.every((id) => done.has(id));
  }

  /** Marks tips done; returns true if that changed anything. */
  finish(...ids: readonly TipId[]): boolean {
    const done = new Set(this.done);
    const before = done.size;
    for (const id of ids) done.add(id);
    if (done.size === before) return false;
    this.store.set(KEY, JSON.stringify([...done]));
    return true;
  }

  /** Turns every tip off. */
  finishAll(): boolean {
    return this.finish(...TIP_IDS);
  }

  /** Shows the tips again from the start. */
  reset(): void {
    this.store.remove(KEY);
  }
}

function readDone(text: string | null): TipId[] {
  if (text === null) return [];
  try {
    const data: unknown = JSON.parse(text);
    return Array.isArray(data) ? TIP_IDS.filter((id) => data.includes(id)) : [];
  } catch {
    return [];
  }
}

/**
 * The tip that fits this moment, if it isn't done: how to load in round 1 until a card is loaded,
 * how to run once a Ship on the Line would sell, and the shop the first time it opens.
 */
export function currentTip(run: ThroughputRun, preview: ShiftResult | null, done: ReadonlySet<TipId>): TipId | null {
  if (run.phase === 'shop') return done.has('shop') ? null : 'shop';
  if (run.phase !== 'shift' || run.round !== 1) return null;
  const loaded = run.line.some((slot) => slot.card !== null);
  if (!loaded && !done.has('load')) return 'load';
  if (preview !== null && preview.shipSales > 0 && !done.has('run')) return 'run';
  return null;
}

/** What each tip says; numbers come from the run. */
export function tipText(id: TipId, run: ThroughputRun): string {
  switch (id) {
    case 'load':
      return 'Tap a card in your hand, then an empty bay to load it. The Batch runs left to right: Makes add Units and Ships sell them, so put a Make before a Ship.';
    case 'run':
      return `The receipt shows what this Shift would make. Load more or run it now: you have ${run.shiftsThisRound} Shifts to reach $${run.target}.`;
    case 'shop':
      return 'Target hit. Spend Capital here: Fixtures power up a bay, cards join your deck, and Contracts improve it. Start the next round when you are ready.';
  }
}
