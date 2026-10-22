import type { Bot } from '../bots';
import { aggregate } from '../report';
import type { SimReport } from '../report';
import { simulate } from '../simulate';
import type { RunFactory, RunStats } from '../simulate';

/** A runnable game setup plus the bots that can play it, with the card type hidden. */
export type Scenario = {
  readonly name: string;
  readonly description: string;
  readonly botNames: readonly string[];
  /** Simulates the named bots (default: all) over `seeds`, one report per bot. */
  run(seeds: readonly number[], botNames?: readonly string[]): SimReport[];
  /** Raw per-run stats for the named bots (default: all) over `seeds`, bot by bot. */
  simulate(seeds: readonly number[], botNames?: readonly string[]): RunStats[];
};

export type ScenarioSpec<TCard> = {
  readonly name: string;
  readonly description: string;
  readonly runFactory: RunFactory<TCard>;
  readonly bots: readonly Bot<TCard>[];
};

export function defineScenario<TCard>(spec: ScenarioSpec<TCard>): Scenario {
  return {
    name: spec.name,
    description: spec.description,
    botNames: spec.bots.map((b) => b.name),
    run(seeds, botNames) {
      return choose(spec.bots, botNames).map((bot) => aggregate(bot.name, simulate(spec.runFactory, bot, seeds)));
    },
    simulate(seeds, botNames) {
      return choose(spec.bots, botNames).flatMap((bot) => simulate(spec.runFactory, bot, seeds));
    },
  };
}

function choose<TCard>(bots: readonly Bot<TCard>[], names: readonly string[] | undefined): readonly Bot<TCard>[] {
  return names === undefined ? bots : bots.filter((b) => names.includes(b.name));
}
