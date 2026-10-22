import type { RunStats } from '../simulate';

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
  readonly bot: string;
  readonly runs: number;
  readonly winRate: number;
  readonly meanRoundReached: number;
  readonly medianRoundReached: number;
  /** Margin over target by round number, for comparing strategy curves. */
  readonly marginCurve: readonly MarginPoint[];
};

export function aggregate(bot: string, stats: readonly RunStats[]): SimReport {
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
    bot,
    runs: stats.length,
    winRate: stats.length === 0 ? 0 : stats.filter((s) => s.won).length / stats.length,
    meanRoundReached: mean(reached),
    medianRoundReached: median(reached),
    marginCurve,
  };
}

/**
 * Compact text tables: one summary row per bot, then mean margin over target per round
 * (with the number of runs that reached it) side by side, so strategy curves can be compared.
 */
export function formatReport(reports: readonly SimReport[]): string {
  const summary = table(
    ['bot', 'runs', 'win%', 'reach mean', 'reach median'],
    reports.map((r) => [r.bot, String(r.runs), pct(r.winRate), r.meanRoundReached.toFixed(2), r.medianRoundReached.toFixed(1)]),
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
  const curve = table(['round', ...reports.map((r) => r.bot)], curveRows);
  return `${summary}\n\nmean margin over target by round\n${curve}`;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const signedPct = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] ?? '').length)));
  const line = (cells: readonly string[]): string => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ').trimEnd();
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}
