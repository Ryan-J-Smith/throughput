import type { Bot } from '../bots';
import { aggregateBy } from '../report';
import type { SimReport } from '../report';
import { simulate } from '../simulate';
import type { RunFactory, RunStats } from '../simulate';

/**
 * A runnable game setup plus the bots that can play it, with the card type hidden. Run-based
 * games use `defineScenario`; games with their own rules engine subclass this directly and
 * produce RunStats (e.g. with RunRecorder) so every report works unchanged.
 */
export abstract class Scenario {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly botNames: readonly string[];

  /** Raw per-run stats for the named bots (default: all) over `seeds`, bot by bot. */
  abstract simulate(seeds: readonly number[], botNames?: readonly string[]): RunStats[];

  /** Simulates the named bots (default: all) over `seeds`, one report per bot. */
  run(seeds: readonly number[], botNames?: readonly string[]): SimReport[] {
    return aggregateBy(this.simulate(seeds, botNames), (s) => s.bot);
  }
}

export type ScenarioSpec<TCard> = {
  readonly name: string;
  readonly description: string;
  readonly runFactory: RunFactory<TCard>;
  readonly bots: readonly Bot<TCard>[];
};

/** Scenario for a Run-based game: each bot plays through the engine's simulate(). */
class RunScenario<TCard> extends Scenario {
  readonly name: string;
  readonly description: string;
  readonly botNames: readonly string[];
  private readonly bots: readonly Bot<TCard>[];
  private readonly runFactory: RunFactory<TCard>;

  constructor(spec: ScenarioSpec<TCard>) {
    super();
    this.name = spec.name;
    this.description = spec.description;
    this.botNames = spec.bots.map((b) => b.name);
    this.bots = spec.bots;
    this.runFactory = spec.runFactory;
  }

  override simulate(seeds: readonly number[], botNames?: readonly string[]): RunStats[] {
    return choose(this.bots, botNames).flatMap((bot) => simulate(this.runFactory, bot, seeds));
  }
}

export function defineScenario<TCard>(spec: ScenarioSpec<TCard>): Scenario {
  return new RunScenario(spec);
}

function choose<TCard>(bots: readonly Bot<TCard>[], names: readonly string[] | undefined): readonly Bot<TCard>[] {
  return names === undefined ? bots : bots.filter((b) => names.includes(b.name));
}
