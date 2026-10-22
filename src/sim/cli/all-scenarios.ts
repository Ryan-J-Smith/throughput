import { BomScenario, bomBots } from '../../games/bom/sim';
import { defaultBomConfig } from '../../games/bom/content';
import { DEFAULT_CONFIG as THROUGHPUT_CONFIG } from '../../games/throughput/content';
import { ExpertBot, ThroughputScenario } from '../../games/throughput/sim';
import { demoScenario } from '../demo';
import type { Scenario } from '../scenarios';

/** Scenarios available to `npm run sim`. Register new design scenarios here. */
export const ALL_SCENARIOS: readonly Scenario[] = [
  demoScenario,
  new BomScenario('bom', 'Bill of Materials (bake-off): greedy baseline vs archetype bots', defaultBomConfig, bomBots()),
  new ThroughputScenario(),
  new ThroughputScenario(
    [new ExpertBot()],
    THROUGHPUT_CONFIG,
    500,
    'throughput-expert',
    'THROUGHPUT, expert bot only: approximates skilled (LLM) play for curve checks; about 1 s a run',
  ),
];
