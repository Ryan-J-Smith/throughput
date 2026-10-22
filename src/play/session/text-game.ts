import { SaveError } from './save-file';
import type { SaveFile } from './save-file';

/** What the CLI shows for a state: readable text, the legal actions, and JSON-safe data for --json. */
export type GameView = {
  readonly text: string;
  readonly legalActions: readonly string[];
  /** Plain JSON data describing the state (printed as `state` with --json). */
  readonly state: unknown;
};

export type TurnResult =
  | { readonly ok: true; readonly save: SaveFile; readonly log: readonly string[]; readonly view: GameView }
  | { readonly ok: false; readonly reason: string; readonly view: GameView };

/**
 * Any game the text CLI can drive: a save is a seed plus text actions, and every call rebuilds
 * the state from it. Run-based games extend `Game`; games with their own rules engine extend
 * `ReplayTextGame`.
 */
export abstract class TextGame {
  abstract readonly name: string;

  newSave(seed: number): SaveFile {
    if (!Number.isInteger(seed)) throw new SaveError(`Seed must be an integer (got ${seed})`);
    return { version: 1, game: this.name, seed, actions: [] };
  }

  /** Replays `save` and describes the resulting state. */
  abstract show(save: SaveFile): GameView;

  /**
   * Replays `save`, then validates and applies `text`. On success returns the save with the
   * action appended (unchanged for read-only queries); on refusal the reason, and the save is unchanged.
   */
  abstract take(save: SaveFile, text: string): TurnResult;
}

export type ReplayStep =
  | {
      readonly ok: true;
      readonly log: readonly string[];
      /** Canonical text to append to the save, or null for a query that changed nothing. */
      readonly record: string | null;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * A TextGame over any deterministic state: subclasses supply a fresh state per seed, a step that
 * parses and applies one text action, and a description of the state. Replay and save handling
 * are shared.
 */
export abstract class ReplayTextGame<TState> extends TextGame {
  /** Fresh state for `seed`; must be deterministic. */
  protected abstract start(seed: number): TState;

  /** Parses and applies one action. A refusal must leave `state` untouched. */
  protected abstract step(state: TState, text: string): ReplayStep;

  protected abstract describe(state: TState, save: SaveFile): GameView;

  /** Rebuilds the state by re-applying every logged action. */
  replay(save: SaveFile): TState {
    if (save.game !== this.name) throw new SaveError(`Save is for game "${save.game}", not "${this.name}"`);
    const state = this.start(save.seed);
    save.actions.forEach((text, i) => {
      const result = this.step(state, text);
      if (!result.ok) throw new SaveError(`Action ${i + 1} "${text}" no longer replays: ${result.reason}`);
    });
    return state;
  }

  override show(save: SaveFile): GameView {
    return this.describe(this.replay(save), save);
  }

  override take(save: SaveFile, text: string): TurnResult {
    const state = this.replay(save);
    const result = this.step(state, text);
    if (!result.ok) return { ok: false, reason: result.reason, view: this.describe(state, save) };
    const next = result.record === null ? save : { ...save, actions: [...save.actions, result.record] };
    return { ok: true, save: next, log: result.log, view: this.describe(state, next) };
  }
}
