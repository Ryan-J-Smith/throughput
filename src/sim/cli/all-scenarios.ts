import { ThroughputScenario } from '../../games/throughput/sim';
import { demoScenario } from '../demo';
import type { Scenario } from '../scenarios';

/** Scenarios available to `npm run sim`. Register new design scenarios here. */
export const ALL_SCENARIOS: readonly Scenario[] = [demoScenario, new ThroughputScenario()];
