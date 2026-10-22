import type { RunStats } from '../simulate';
import { mean, median, pct, signedPct, table, toCsv } from './text';

export type MarginPoint = {
  readonly round: number;
  /** Runs that played this round. */
  readonly samples: number;
  readonly meanMargin: number;
  readonly medianMargin: number;
  /** Fraction of those runs that cleared it. */
  readonly clearRate: number;
};

export type SimReport = {
  /** What the runs were grouped by: a bot name or an archetype. */
  readonly group: string;
  readonly runs: number;
  readonly winRate: number;
  readonly meanRoundReached: number;
  readonly medianRoundReached: number;
  /** Margin over target by round number, for comparing strategy curves. */
  readonly marginCurve: readonly MarginPoint[];
};

export function aggregate(group: string, stats: readonly RunStats[]): SimReport {
  const byRound = new Map<number, { margins: number[]; cleared: number }>();
  for (const run of stats) {
    for (const round of run.rounds) {
      const entry = byRound.get(round.round) ?? { margins: [], cleared: 0 };
      entry.margins.push(round.margin);
      if (round.won) entry.cleared++;
      byRound.set(round.round, entry);
    }
  }
  const marginCurve = [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, { margins, cleared }]) => ({
      round,
      samples: margins.length,
      meanMargin: mean(margins),
      medianMargin: median(margins),
      clearRate: cleared / margins.length,
    }));
  const reached = stats.map((s) => s.roundReached);
  return {
    group,
    runs: stats.length,
    winRate: stats.length === 0 ? 0 : stats.filter((s) => s.won).length / stats.length,
    meanRoundReached: mean(reached),
    medianRoundReached: median(reached),
    marginCurve,
  };
}

/** One report per distinct `key(run)`, in order of first appearance. */
export function aggregateBy(stats: readonly RunStats[], key: (run: RunStats) => string): SimReport[] {
  const groups = new Map<string, RunStats[]>();
  for (const run of stats) {
    const k = key(run);
    groups.set(k, [...(groups.get(k) ?? []), run]);
  }
  return [...groups].map(([group, runs]) => aggregate(group, runs));
}

/**
 * Compact text tables: one summary row per group, then mean margin over target per round
 * (with the number of runs that reached it) side by side, so strategy curves can be compared.
 */
export function formatReport(reports: readonly SimReport[], groupName = 'bot'): string {
  const summary = table(
    [groupName, 'runs', 'win%', 'reach mean', 'reach median'],
    reports.map((r) => [r.group, String(r.runs), pct(r.winRate), r.meanRoundReached.toFixed(2), r.medianRoundReached.toFixed(1)]),
  );
  const maxRound = Math.max(0, ...reports.flatMap((r) => r.marginCurve.map((p) => p.round)));
  const curveRows: string[][] = [];
  for (let round = 1; round <= maxRound; round++) {
    curveRows.push([
      String(round),
      ...reports.map((r) => {
        const point = r.marginCurve.find((p) => p.round === round);
        return point ? `${signedPct(point.meanMargin)} n=${point.samples}` : '-';
      }),
    ]);
  }
  const curve = table(['round', ...reports.map((r) => r.group)], curveRows);
  return `${summary}\n\nmean margin over target by round\n${curve}`;
}

/** Margin curves as CSV rows, one per (grouping, group, round), with the group's run totals repeated. */
export function curvesCsv(groupings: readonly { readonly grouping: string; readonly reports: readonly SimReport[] }[]): string {
  const rows = groupings.flatMap(({ grouping, reports }) =>
    reports.flatMap((r) =>
      r.marginCurve.map((p) => [grouping, r.group, r.runs, r.winRate, p.round, p.samples, p.meanMargin, p.medianMargin, p.clearRate]),
    ),
  );
  return toCsv(['grouping', 'group', 'runs', 'win_rate', 'round', 'samples', 'mean_margin', 'median_margin', 'clear_rate'], rows);
}
