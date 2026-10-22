import { BomScenario, bomBots } from '../../games/bom/sim';
import { defaultBomConfig } from '../../games/bom/content';
import { demoScenario } from '../demo';
import type { Scenario } from '../scenarios';

/** Scenarios available to `npm run sim`. Register new design scenarios here. */
export const ALL_SCENARIOS: readonly Scenario[] = [
  demoScenario,
  new BomScenario('bom', 'Bill of Materials (bake-off): greedy baseline vs archetype bots', defaultBomConfig, bomBots()),
];
