import type { RunStats } from '../simulate';

/** Outcomes of the buy-or-skip decisions made at one shop round. */
export type ImpactStratum = {
  /** The round just cleared before the shop where the item was offered. */
  readonly round: number;
  readonly bought: number;
  readonly skipped: number;
  readonly winRateBought: number | null;
  readonly winRateSkipped: number | null;
};

export type ItemImpact = {
  readonly id: string;
  readonly kind: string;
  /** Times the item was shown (restocks and rerolls). */
  readonly offers: number;
  /** Times it was bought. */
  readonly purchases: number;
  /** purchases / offers. */
  readonly pickRate: number;
  readonly runsOffered: number;
  /** Runs that bought it at least once. */
  readonly runsBought: number;
  /** Runs where it was offered but never bought. */
  readonly runsSkipped: number;
  readonly winRateBought: number | null;
  readonly winRateSkipped: number | null;
  /** winRateBought − winRateSkipped over whole runs; inflated by survivorship for late items. */
  readonly naiveWinDelta: number | null;
  /** Mean round of a run's first purchase (the round cleared before that shop). */
  readonly meanPurchaseRound: number | null;
  /** Mean rounds cleared after a run's first purchase. */
  readonly meanRoundsAfterPurchase: number | null;
  /**
   * Survivorship-aware win-rate difference: within each shop round r, compare runs that bought
   * the item at r with runs that were offered it at r and skipped it (only decisions made before
   * any earlier purchase of it count), then take the weighted mean over r with weights
   * nb·ns/(nb+ns). Null when no round has both a buyer and a skipper.
   */
  readonly awareWinDelta: number | null;
  /** Same stratification, comparing extra rounds cleared after r instead of wins. */
  readonly awareSurvivalDelta: number | null;
  /** Sum of the stratum weights; a rough effective sample size for the aware deltas. */
  readonly awareWeight: number;
  readonly strata: readonly ImpactStratum[];
  /** True when fewer than `minSamples` runs bought it or skipped it. */
  readonly lowSample: boolean;
};

export type ImpactOptions = {
  /** Minimum runs on each side (bought / skipped) before an item's numbers are trusted. Default 20. */
  readonly minSamples?: number;
};

type Decision = { readonly bought: boolean; readonly won: boolean; readonly survivedAfter: number };

type ItemAccumulator = {
  readonly id: string;
  readonly kind: string;
  offers: number;
  purchases: number;
  runsOffered: number;
  readonly bought: { won: boolean; firstRound: number; roundsAfter: number }[];
  readonly skippedWins: boolean[];
  readonly decisions: Map<number, Decision[]>;
};

/**
 * Per shop item: how often it is offered and picked, how runs that bought it fared, and a
 * survivorship-aware comparison against runs at the same decision point that skipped it.
 * Sorted by awareWinDelta (highest first; items without one last).
 */
export function computeImpact(stats: readonly RunStats[], options: ImpactOptions = {}): ItemImpact[] {
  const minSamples = options.minSamples ?? 20;
  const items = new Map<string, ItemAccumulator>();

  for (const run of stats) {
    const offeredRounds = new Map<string, Set<number>>();
    for (const offer of run.offers) {
      const item = accumulator(items, offer.id, offer.kind);
      item.offers++;
      const rounds = offeredRounds.get(offer.id) ?? new Set<number>();
      rounds.add(offer.round);
      offeredRounds.set(offer.id, rounds);
    }
    const boughtRounds = new Map<string, Set<number>>();
    for (const purchase of run.purchases) {
      accumulator(items, purchase.id, purchase.kind).purchases++;
      const rounds = boughtRounds.get(purchase.id) ?? new Set<number>();
      rounds.add(purchase.round);
      boughtRounds.set(purchase.id, rounds);
    }

    for (const [id, offered] of offeredRounds) {
      const item = items.get(id) as ItemAccumulator;
      item.runsOffered++;
      const bought = boughtRounds.get(id);
      const firstBuy = bought === undefined ? Infinity : Math.min(...bought);
      if (bought === undefined) item.skippedWins.push(run.won);
      else item.bought.push({ won: run.won, firstRound: firstBuy, roundsAfter: run.roundsCleared - firstBuy });

      for (const round of [...offered].sort((a, b) => a - b)) {
        if (round > firstBuy) break; // later decisions are confounded by already owning it
        const list = item.decisions.get(round) ?? [];
        list.push({ bought: round === firstBuy, won: run.won, survivedAfter: run.roundsCleared - round });
        item.decisions.set(round, list);
      }
    }
  }

  return [...items.values()].map((item) => summarize(item, minSamples)).sort(byAwareDelta);
}

function accumulator(items: Map<string, ItemAccumulator>, id: string, kind: string): ItemAccumulator {
  let item = items.get(id);
  if (item === undefined) {
    item = { id, kind, offers: 0, purchases: 0, runsOffered: 0, bought: [], skippedWins: [], decisions: new Map() };
    items.set(id, item);
  }
  return item;
}

function summarize(item: ItemAccumulator, minSamples: number): ItemImpact {
  const winRateBought = rate(item.bought.map((b) => b.won));
  const winRateSkipped = rate(item.skippedWins);

  const strata: ImpactStratum[] = [];
  let weight = 0;
  let winSum = 0;
  let survivalSum = 0;
  for (const [round, decisions] of [...item.decisions].sort(([a], [b]) => a - b)) {
    const bought = decisions.filter((d) => d.bought);
    const skipped = decisions.filter((d) => !d.bought);
    const winBought = rate(bought.map((d) => d.won));
    const winSkipped = rate(skipped.map((d) => d.won));
    strata.push({ round, bought: bought.length, skipped: skipped.length, winRateBought: winBought, winRateSkipped: winSkipped });
    if (winBought === null || winSkipped === null) continue;
    const w = (bought.length * skipped.length) / (bought.length + skipped.length);
    weight += w;
    winSum += w * (winBought - winSkipped);
    survivalSum += w * (mean(bought.map((d) => d.survivedAfter)) - mean(skipped.map((d) => d.survivedAfter)));
  }

  return {
    id: item.id,
    kind: item.kind,
    offers: item.offers,
    purchases: item.purchases,
    pickRate: item.offers === 0 ? 0 : item.purchases / item.offers,
    runsOffered: item.runsOffered,
    runsBought: item.bought.length,
    runsSkipped: item.skippedWins.length,
    winRateBought,
    winRateSkipped,
    naiveWinDelta: winRateBought === null || winRateSkipped === null ? null : winRateBought - winRateSkipped,
    meanPurchaseRound: item.bought.length === 0 ? null : mean(item.bought.map((b) => b.firstRound)),
    meanRoundsAfterPurchase: item.bought.length === 0 ? null : mean(item.bought.map((b) => b.roundsAfter)),
    awareWinDelta: weight > 0 ? winSum / weight : null,
    awareSurvivalDelta: weight > 0 ? survivalSum / weight : null,
    awareWeight: weight,
    strata,
    lowSample: Math.min(item.bought.length, item.skippedWins.length) < minSamples,
  };
}

function byAwareDelta(a: ItemImpact, b: ItemImpact): number {
  if (a.awareWinDelta === null || b.awareWinDelta === null) {
    if (a.awareWinDelta !== b.awareWinDelta) return a.awareWinDelta === null ? 1 : -1;
  } else if (a.awareWinDelta !== b.awareWinDelta) {
    return b.awareWinDelta - a.awareWinDelta;
  }
  return a.id.localeCompare(b.id);
}

function rate(outcomes: readonly boolean[]): number | null {
  return outcomes.length === 0 ? null : outcomes.filter(Boolean).length / outcomes.length;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
