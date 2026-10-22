// TEMPORARY: makes the sim harness's placeholder demo (src/sim/demo) playable in the browser.
// Replace with the real design's GameDefinition once it exists.
import { GameDefinition } from '../../app';
import type { RunConfig } from '../../engine/run';
import { ProductFormula } from '../../engine/scoring';
import { DemoEvaluator, demoConfig } from '../../sim/demo';
import type { DemoCard } from '../../sim/demo';
import { DemoPresenter } from './DemoPresenter';

export class DemoGame extends GameDefinition<DemoCard> {
  readonly formula = new ProductFormula({ base: 0, multiplier: 1 });
  readonly evaluator = new DemoEvaluator();
  readonly presenter = new DemoPresenter();

  override createConfig(): RunConfig<DemoCard> {
    return demoConfig();
  }
}
