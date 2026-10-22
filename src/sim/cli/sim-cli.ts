// Entry point for `npm run sim`: headless bot simulations printed as compact tables.
//   npm run sim -- [--scenario demo] [--runs 200] [--first-seed 1] [--bots greedy,hoarder]
import { formatReport } from '../report';
import { ALL_SCENARIOS } from './all-scenarios';

// Only what this script needs from Node; the project does not ship @types/node.
declare const process: { readonly argv: readonly string[]; exitCode?: number };

function option(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(args: readonly string[]): number {
  if (args.includes('--help')) {
    console.log('usage: npm run sim -- [--scenario NAME] [--runs N] [--first-seed N] [--bots a,b]');
    console.log(`scenarios: ${ALL_SCENARIOS.map((s) => `${s.name} (${s.botNames.join(', ')})`).join('; ')}`);
    return 0;
  }
  const name = option(args, 'scenario') ?? 'demo';
  const scenario = ALL_SCENARIOS.find((s) => s.name === name);
  if (scenario === undefined) {
    console.error(`unknown scenario "${name}"; known: ${ALL_SCENARIOS.map((s) => s.name).join(', ')}`);
    return 1;
  }
  const runs = Number(option(args, 'runs') ?? '200');
  const firstSeed = Number(option(args, 'first-seed') ?? '1');
  if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(firstSeed)) {
    console.error('--runs must be a positive integer and --first-seed an integer');
    return 1;
  }
  const bots = option(args, 'bots')?.split(',');
  const seeds = Array.from({ length: runs }, (_, i) => firstSeed + i);
  console.log(`${scenario.name}: ${scenario.description}`);
  console.log(`seeds ${firstSeed}..${firstSeed + runs - 1}\n`);
  console.log(formatReport(scenario.run(seeds, bots)));
  return 0;
}

process.exitCode = main(process.argv.slice(2));
