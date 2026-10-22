import { computeImpact } from '../impact';
import { aggregateBy, curvesCsv, formatImpact, formatReport, impactCsv } from '../report';
import type { Scenario } from '../scenarios';

/** Console and file output for the sim command; injected so it runs without Node in tests. */
export abstract class SimIo {
  abstract out(text: string): void;
  abstract err(text: string): void;
  abstract write(path: string, text: string): void;
}

const REPORTS = ['curves', 'impact', 'all'] as const;
type ReportKind = (typeof REPORTS)[number];

const VALUE_OPTIONS = ['scenario', 'runs', 'first-seed', 'bots', 'report', 'csv', 'min-samples'] as const;
type ValueOption = (typeof VALUE_OPTIONS)[number];

const USAGE = `usage: npm run sim -- [--scenario NAME] [--runs N] [--first-seed N] [--bots a,b]
                      [--report curves|impact|all] [--min-samples N] [--csv PATH]
  curves  win rate, rounds reached and margin-over-target curves per bot (and per archetype)
  impact  per shop item: pick rate, win rates bought vs skipped, survivorship-aware deltas
  --csv   also write the report data as CSV (PATH-curves.csv / PATH-impact.csv for --report all)`;

class UsageError extends Error {}

/** Runs one `npm run sim` invocation; returns the exit code (0 ok, 1 bad arguments). */
export function runSimCli(args: readonly string[], io: SimIo, scenarios: readonly Scenario[]): number {
  try {
    const options = parseArgs(args);
    if (options === 'help') {
      io.out(USAGE);
      io.out(`scenarios: ${scenarios.map((s) => `${s.name} (bots: ${s.botNames.join(', ')})`).join('; ')}`);
      return 0;
    }
    return simulateAndReport(options, io, scenarios);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.err(`error: ${error.message}\n${USAGE}`);
    return 1;
  }
}

function simulateAndReport(options: ReadonlyMap<ValueOption, string>, io: SimIo, scenarios: readonly Scenario[]): number {
  const name = options.get('scenario') ?? 'demo';
  const scenario = scenarios.find((s) => s.name === name);
  if (scenario === undefined) throw new UsageError(`unknown scenario "${name}"; known: ${scenarios.map((s) => s.name).join(', ')}`);
  const runs = integer(options, 'runs', 200, 1);
  const firstSeed = integer(options, 'first-seed', 1);
  const minSamples = integer(options, 'min-samples', 20, 0);
  const report = (options.get('report') ?? 'curves') as ReportKind;
  if (!REPORTS.includes(report)) throw new UsageError(`--report must be one of ${REPORTS.join(', ')}`);
  const bots = options.get('bots')?.split(',');
  const unknownBots = bots?.filter((b) => !scenario.botNames.includes(b)) ?? [];
  if (unknownBots.length > 0) throw new UsageError(`unknown bot(s) ${unknownBots.join(', ')}; known: ${scenario.botNames.join(', ')}`);

  const seeds = Array.from({ length: runs }, (_, i) => firstSeed + i);
  const stats = scenario.simulate(seeds, bots);
  const botNames = bots ?? scenario.botNames;
  io.out(`${scenario.name}: ${scenario.description}`);
  io.out(`seeds ${firstSeed}..${firstSeed + runs - 1} · bots ${botNames.join(', ')}`);

  const csv: { suffix: string; text: string }[] = [];
  if (report === 'curves' || report === 'all') {
    const byBot = aggregateBy(stats, (s) => s.bot);
    const byArchetype = aggregateBy(stats, (s) => s.archetype);
    io.out(`\n${formatReport(byBot, 'bot')}`);
    if (stats.some((s) => s.archetype !== s.bot)) io.out(`\nby archetype\n${formatReport(byArchetype, 'archetype')}`);
    csv.push({ suffix: 'curves', text: curvesCsv([{ grouping: 'bot', reports: byBot }, { grouping: 'archetype', reports: byArchetype }]) });
  }
  if (report === 'impact' || report === 'all') {
    const impact = computeImpact(stats, { minSamples });
    io.out(`\n${formatImpact(impact)}`);
    io.out(`pooled over ${stats.length} runs from bots ${botNames.join(', ')}; LOW N = fewer than ${minSamples} runs bought or skipped it`);
    csv.push({ suffix: 'impact', text: impactCsv(impact) });
  }

  const csvPath = options.get('csv');
  if (csvPath !== undefined) {
    for (const { suffix, text } of csv) {
      const path = csv.length === 1 ? csvPath : withSuffix(csvPath, suffix);
      io.write(path, text);
      io.out(`wrote ${path}`);
    }
  }
  return 0;
}

/** "out/run.csv" + "impact" → "out/run-impact.csv". */
export function withSuffix(path: string, suffix: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  return dot > slash + 1 ? `${path.slice(0, dot)}-${suffix}${path.slice(dot)}` : `${path}-${suffix}`;
}

function integer(options: ReadonlyMap<ValueOption, string>, name: ValueOption, fallback: number, min = -Infinity): number {
  const raw = options.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) throw new UsageError(`--${name} must be an integer${min > -Infinity ? ` ≥ ${min}` : ''}`);
  return value;
}

function parseArgs(args: readonly string[]): ReadonlyMap<ValueOption, string> | 'help' {
  const options = new Map<ValueOption, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--') continue;
    if (arg === '--help') return 'help';
    const name = arg.startsWith('--') ? arg.slice(2) : undefined;
    const option = VALUE_OPTIONS.find((o) => o === name);
    if (option === undefined) throw new UsageError(`unexpected argument "${arg}"`);
    const value = args[++i];
    if (value === undefined) throw new UsageError(`--${option} needs a value`);
    options.set(option, value);
  }
  return options;
}
