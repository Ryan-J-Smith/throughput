import { defineScenario } from '../scenarios';
import { GreedyBot, HoarderBot, RandomBot } from './demo-bots';
import { demoRun } from './demo-content';

export const demoScenario = defineScenario({
  name: 'demo',
  description: 'Placeholder numeric-card game (sum × cards played) for exercising the harness',
  runFactory: demoRun,
  bots: [new GreedyBot(), new HoarderBot(), new RandomBot()],
});
