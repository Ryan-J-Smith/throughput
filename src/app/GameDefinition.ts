import { Rng } from '../engine/rng';
import { Run } from '../engine/run';
import type { PlayEvaluator, RunConfig } from '../engine/run';
import type { ScoreFormula } from '../engine/scoring';
import type { ContentPresenter } from './ContentPresenter';

/**
 * Everything a design provides to be playable in the app: rules (config), scoring (formula and
 * evaluator) and presentation. Runs are built here so the formula the controller uses to replay
 * score logs is always the one the run scored with.
 */
export abstract class GameDefinition<TCard> {
  abstract readonly formula: ScoreFormula;
  /** Shared by every run this definition creates, so it must not hold per-run state. */
  abstract readonly evaluator: PlayEvaluator<TCard>;
  abstract readonly presenter: ContentPresenter<TCard>;

  /** A fresh config per run, so card instances are never shared between runs. */
  abstract createConfig(): RunConfig<TCard>;

  createRun(seed: number): Run<TCard> {
    return new Run(this.createConfig(), { rng: new Rng(seed), evaluator: this.evaluator, formula: this.formula });
  }
}
