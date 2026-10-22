import { designAdd } from '../model';
import type { Card, FixtureDef, Stage } from '../model';
import { scoreLine } from '../rules';
import type { LineSlot, Placement, ThroughputRun } from '../rules';

const STAGES: readonly Stage[] = ['design', 'make', 'ship'];

/** Extra value a bot sees in putting `card` into `slot`, on top of this Shift's sales. */
export type PlacementBias = (card: Card, slot: number, run: ThroughputRun) => number;

export type PlanOptions = {
  /**
   * Value of a Design loaded now, per Shift it would stay after this one, as a fraction of its
   * Margin bonus on a typical 12-Unit Batch. Only counts while this Shift can't finish the round.
   */
  readonly designPersistence: number;
  readonly bias?: PlacementBias;
};

/** Units a typical starter Batch sells, for valuing a Design's future Shifts. */
const TYPICAL_UNITS = 12;

/** Slots a Line needs free of parked Designs to keep making and shipping. */
const MAKE_AND_SHIP_SLOTS = 3;

/** Slots that can hold a card this round (not Stations, not welded). */
function cardSlots(run: ThroughputRun): number {
  return run.line.filter((slot, i) => slot.fixture?.def.kind !== 'station' && !run.isWelded(i)).length;
}

/**
 * Parked Designs to scrap so the Line can still make and ship: when fewer than 2 slots are open,
 * the weakest parked Design (never one growing on an R&D Lab). Empty when nothing needs scrapping.
 */
export function scrapChoice(run: ThroughputRun): number[] {
  const open = run.line.filter((slot, i) => slot.card === null && slot.fixture?.def.kind !== 'station' && !run.isWelded(i)).length;
  if (open >= 2) return [];
  const parked = run.line
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot, i }) => slot.card?.card.def.stage === 'design' && slot.fixture?.def.id !== 'rnd-lab' && run.whyCannotScrap([i]) === null)
    .sort((a, b) => futureDesignValue(a.slot.card?.card as Card) - futureDesignValue(b.slot.card?.card as Card));
  return parked.slice(0, 2 - open).map(({ i }) => i);
}

/**
 * Plans this Shift's loads by hill-climbing over slot assignments (add, remove, move, swap,
 * replace), scoring each with the exact preview plus the strategy's bonuses. Arrangement matters
 * (Designs before Ships, Makes on Overtime Crews, Ships after the Gun), which one-card-at-a-time
 * greedy insertion can't see. Returns placements for one `load`, hand indexes into the current hand.
 */
export function planLoad(run: ThroughputRun, options: PlanOptions): Placement[] {
  const ctx = run.shiftContext();
  const base: LineSlot[] = run.line.map((s) => ({ fixture: s.fixture, card: s.card?.card ?? null }));
  const open = run.hand.length === 0 ? [] : run.line.map((_, i) => i).filter((i) => run.whyCannotLoad([{ hand: 0, slot: i }]) === null);
  const shiftsAfter = run.shiftsThisRound - run.shift;
  const needed = run.target - run.sales;
  // A parked Design takes its slot all round; past this many, the Line can't both make and ship.
  const maxDesigns = cardSlots(run) - MAKE_AND_SHIP_SLOTS;
  const parkedDesigns = base.filter((slot) => slot.card?.def.stage === 'design').length;

  const value = (assign: ReadonlyMap<number, number>): number => {
    const line = base.map((slot, i) => {
      const hand = assign.get(i);
      return hand === undefined ? slot : { fixture: slot.fixture, card: run.hand[hand] as Card };
    });
    const total = scoreLine(line, ctx, { trace: false }).total;
    let designs = parkedDesigns;
    for (const hand of assign.values()) if (run.hand[hand]?.def.stage === 'design') designs++;
    const persists = total < needed && designs <= maxDesigns;
    let bonus = 0;
    for (const [slot, hand] of assign) {
      const card = run.hand[hand] as Card;
      bonus += options.bias?.(card, slot, run) ?? 0;
      if (card.def.stage === 'design' && persists) bonus += futureDesignValue(card) * options.designPersistence * shiftsAfter;
    }
    return total + bonus;
  };

  const climb = (start: Map<number, number>): { assign: Map<number, number>; value: number } => {
    let current = { assign: start, value: value(start) };
    for (let step = 0; step < 40; step++) {
      let next: { assign: Map<number, number>; value: number } | null = null;
      for (const candidate of neighbours(current.assign, open, run.hand.length)) {
        const v = value(candidate);
        if (v > current.value + 1e-9 && (next === null || v > next.value)) next = { assign: candidate, value: v };
      }
      if (next === null) break;
      current = next;
    }
    return current;
  };

  // Two starts: empty, and the best canonical Designs → Makes → Ships fill. One-move climbs from
  // empty stall when a lone Make loses money (JIT Auditor) and a lone Ship has nothing to sell.
  let canonical: { assign: Map<number, number>; value: number } | null = null;
  for (const start of canonicalStarts(run, open)) {
    const v = value(start);
    if (canonical === null || v > canonical.value) canonical = { assign: start, value: v };
  }
  const results = [climb(new Map()), ...(canonical === null ? [] : [climb(canonical.assign)])];
  const best = results.reduce((a, b) => (b.value > a.value ? b : a));
  return [...best.assign].map(([slot, hand]) => ({ hand, slot }));
}

/** Fills open slots left to right with d Designs, then m Makes, then s Ships, for every count mix. */
function* canonicalStarts(run: ThroughputRun, open: readonly number[]): Generator<Map<number, number>> {
  const byStage = (stage: Stage) => run.hand.map((c, i) => (c.def.stage === stage ? i : -1)).filter((i) => i >= 0);
  const [designs, makes, ships] = [byStage('design'), byStage('make'), byStage('ship')];
  for (let d = 0; d <= designs.length; d++) {
    for (let m = 1; m <= makes.length; m++) {
      for (let s = 1; s <= ships.length; s++) {
        if (d + m + s > open.length) continue;
        const order = [...designs.slice(0, d), ...makes.slice(0, m), ...ships.slice(0, s)];
        yield new Map(order.map((hand, i) => [open[i] as number, hand]));
      }
    }
  }
}

/** Margin a Design adds to a typical Batch each Shift it stays. */
function futureDesignValue(card: Card): number {
  if (card.def.stage !== 'design') return 0;
  return (designAdd(card) + (card.def.marginMul - 1) * 6) * TYPICAL_UNITS;
}

/** Every assignment one move away: add, remove, move to an empty slot, swap two, or replace with an unplaced card. */
function* neighbours(assign: ReadonlyMap<number, number>, open: readonly number[], handSize: number): Generator<Map<number, number>> {
  const placedHands = new Set(assign.values());
  const unplaced = Array.from({ length: handSize }, (_, i) => i).filter((i) => !placedHands.has(i));
  const empty = open.filter((s) => !assign.has(s));
  const placed = [...assign];
  for (const hand of unplaced) for (const slot of empty) yield new Map(assign).set(slot, hand);
  for (const [slot, hand] of placed) {
    const without = new Map(assign);
    without.delete(slot);
    yield without;
    for (const to of empty) yield new Map(without).set(to, hand);
    for (const other of unplaced) yield new Map(assign).set(slot, other);
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [a, ha] = placed[i] as [number, number];
      const [b, hb] = placed[j] as [number, number];
      yield new Map(assign).set(a, hb).set(b, ha);
    }
  }
}

/**
 * Hand cards to Retool when the round can't make a sale yet: no Ship or no Make among hand and
 * Line. Discards up to 3 of the most plentiful Stage in hand. Empty when no Retool is needed.
 */
export function retoolChoice(run: ThroughputRun): number[] {
  if (run.whyCannotRetool([0]) !== null || run.drawPile.length === 0) return [];
  const inPlay = [...run.hand, ...run.line.flatMap((s) => (s.card === null ? [] : [s.card.card]))];
  const has = (stage: Stage) => inPlay.some((c) => c.def.stage === stage);
  if (has('ship') && has('make')) return [];
  const count = (stage: Stage) => run.hand.filter((c) => c.def.stage === stage).length;
  const surplus = STAGES.reduce((a, b) => (count(b) > count(a) ? b : a));
  return run.hand
    .map((c, i) => (c.def.stage === surplus ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, run.config.retoolMax);
}

/** Where a Fixture works best along the Line, from 0 (left) to 1 (right). */
const FIXTURE_POSITION: Readonly<Record<string, number>> = {
  'rnd-lab': 0,
  'patent-office': 0,
  'design-studio': 0.1,
  'quality-lab': 0,
  'lean-cell': 0.3,
  'conveyor-belt': 0.4,
  'robotics-cell': 0.4,
  megafactory: 0.6,
  'logistics-hub': 0.7,
  'signature-line': 0.6,
  'cross-dock': 0.8,
  'packaging-line': 1,
  'luxury-counter': 1,
  'express-lane': 1,
  superstore: 1,
  'price-gun': 0.4,
  'overtime-crew': 0.5,
  automation: 0.5,
  'assembly-line': 0.7,
  warehouse: 0.8,
  'brand-manager': 1,
  showroom: 1,
  'flagship-store': 1,
  'robot-arm': 1,
};

/** The slot without a Fixture nearest to where `def` works best, or null if none is free. */
export function preferredSlot(def: FixtureDef, run: ThroughputRun): number | null {
  const ideal = (FIXTURE_POSITION[def.id] ?? 0.5) * (run.line.length - 1);
  const free = run.line.map((s, i) => ({ s, i })).filter(({ s }) => s.fixture === null);
  free.sort((a, b) => Math.abs(a.i - ideal) - Math.abs(b.i - ideal));
  return free[0]?.i ?? null;
}

const VOLUME_FIXTURES: readonly string[] = ['overtime-crew', 'assembly-line', 'automation', 'megafactory', 'logistics-hub', 'superstore', 'robotics-cell', 'conveyor-belt'];
const VOLUME_CARDS: readonly string[] = ['factory-floor', 'wholesale-club', 'contract-manufacturer', 'export-deal'];

/** What a run ended up building, for archetype breakdowns. */
export function classifyBuild(run: ThroughputRun): string {
  const fixtures = run.line.flatMap((s) => (s.fixture === null ? [] : [s.fixture.def.id]));
  const cards = run.deck.filter((c) => c.paid > 0).map((c) => c.def.id);
  const has = (id: string) => fixtures.includes(id);
  if (has('rnd-lab') || has('patent-office')) return 'rnd-compounder';
  if (has('price-gun') || has('luxury-counter') || has('lean-cell')) return 'skimmer';
  if (has('warehouse')) return 'stockpile';
  const volume = fixtures.filter((f) => VOLUME_FIXTURES.includes(f)).length;
  const volumeCards = cards.filter((c) => VOLUME_CARDS.includes(c)).length;
  if (volume + volumeCards >= 2) return 'mass-market';
  const designs = cards.filter((c) => c === 'influencer' || c === 'rebrand').length;
  if (designs > 0 && (has('quality-lab') || has('design-studio') || has('robot-arm'))) return 'design-stack';
  if (fixtures.length + cards.length === 0) return 'starter';
  return 'mixed';
}
