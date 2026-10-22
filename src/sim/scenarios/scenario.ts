import type { Bot } from '../bots';
import { aggregate } from '../report';
import type { SimReport } from '../report';
import { simulate } from '../simulate';
import type { RunFactory } from '../simulate';

/** A runnable game setup plus the bots that can play it, with the card type hidden. */
export type Scenario = {
  readonly name: string;
  readonly description: string;
  readonly botNames: readonly string[];
  /** Simulates the named bots (default: all) over `seeds`, one report per bot. */
  run(seeds: readonly number[], botNames?: readonly string[]): SimReport[];
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
      const chosen = botNames === undefined ? spec.bots : spec.bots.filter((b) => botNames.includes(b.name));
      return chosen.map((bot) => aggregate(bot.name, simulate(spec.runFactory, bot, seeds)));
    },
  };
}
