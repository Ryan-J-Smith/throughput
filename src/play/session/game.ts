import type { Run } from '../../engine/run';
import { applyAction, formatAction, parseAction } from '../actions';
import type { Renderer } from '../render';
import { buildView, formatView } from '../view';
import type { StateView } from '../view';
import { SaveError } from './save-file';
import type { SaveFile } from './save-file';
import { TextGame } from './text-game';
import type { GameView, TurnResult } from './text-game';

export type ActResult =
  | { readonly ok: true; readonly save: SaveFile; readonly log: readonly string[]; readonly view: StateView }
  | { readonly ok: false; readonly reason: string; readonly view: StateView };

/** A Run-based game as the CLI sees it: no card type, only saves, views and text actions. */
export abstract class Game extends TextGame {
  /** Replays `save` and describes the resulting state. */
  abstract view(save: SaveFile): StateView;

  /**
   * Replays `save`, then validates and applies `text`. On success returns the save with the
   * action appended; on refusal the reason, and the save is unchanged.
   */
  abstract act(save: SaveFile, text: string): ActResult;

  override show(save: SaveFile): GameView {
    return toGameView(this.view(save));
  }

  override take(save: SaveFile, text: string): TurnResult {
    const result = this.act(save, text);
    return { ...result, view: toGameView(result.view) };
  }
}

function toGameView(view: StateView): GameView {
  return { text: formatView(view), legalActions: view.legalActions, state: view };
}

export type GameDefinition<TCard> = {
  readonly name: string;
  /** Builds a fresh run for a seed; must be deterministic. */
  readonly createRun: (seed: number) => Run<TCard>;
  readonly renderer: Renderer<TCard>;
};

export class PlayableGame<TCard> extends Game {
  readonly name: string;
  private readonly definition: GameDefinition<TCard>;

  constructor(definition: GameDefinition<TCard>) {
    super();
    this.name = definition.name;
    this.definition = definition;
  }

  /** Rebuilds the run by starting it and re-applying every logged action. */
  replay(save: SaveFile): Run<TCard> {
    if (save.game !== this.name) throw new SaveError(`Save is for game "${save.game}", not "${this.name}"`);
    const run = this.definition.createRun(save.seed);
    run.start();
    save.actions.forEach((text, i) => {
      const parsed = parseAction(text);
      const outcome = parsed.ok ? applyAction(run, parsed.action, this.definition.renderer) : parsed;
      if (!outcome.ok) throw new SaveError(`Action ${i + 1} "${text}" no longer replays: ${outcome.reason}`);
    });
    return run;
  }

  override view(save: SaveFile): StateView {
    return this.describe(this.replay(save), save);
  }

  override act(save: SaveFile, text: string): ActResult {
    const run = this.replay(save);
    const parsed = parseAction(text);
    if (!parsed.ok) return { ok: false, reason: parsed.reason, view: this.describe(run, save) };
    const outcome = applyAction(run, parsed.action, this.definition.renderer);
    if (!outcome.ok) return { ok: false, reason: outcome.reason, view: this.describe(run, save) };
    const next: SaveFile = { ...save, actions: [...save.actions, formatAction(parsed.action)] };
    return { ok: true, save: next, log: outcome.log, view: this.describe(run, next) };
  }

  private describe(run: Run<TCard>, save: SaveFile): StateView {
    return buildView(run, this.definition.renderer, { game: this.name, seed: save.seed, actionsTaken: save.actions.length });
  }
}
