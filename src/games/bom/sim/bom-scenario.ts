import { Scenario } from '../../../sim/scenarios';
import type { RunStats } from '../../../sim/simulate';
import type { BomConfig } from '../rules';
import type { BomBot } from './bom-bot';
import { simulateBom } from './simulate-bom';

/** Sim scenario for Bill of Materials: each bot plays BomRuns from `config`. */
export class BomScenario extends Scenario {
  readonly name: string;
  readonly description: string;
  readonly botNames: readonly string[];
  private readonly config: () => BomConfig;
  private readonly bots: readonly BomBot[];

  constructor(name: string, description: string, config: () => BomConfig, bots: readonly BomBot[]) {
    super();
    this.name = name;
    this.description = description;
    this.config = config;
    this.bots = bots;
    this.botNames = bots.map((b) => b.name);
  }

  override simulate(seeds: readonly number[], botNames?: readonly string[]): RunStats[] {
    const chosen = botNames === undefined ? this.bots : this.bots.filter((b) => botNames.includes(b.name));
    return chosen.flatMap((bot) => simulateBom(this.config, bot, seeds));
  }
}
