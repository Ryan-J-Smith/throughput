import { SaveError, parseSave, serializeSave } from '../../../play/session';
import type { SaveFile } from '../../../play/session';
import type { KeyValueStore } from '../../../ui/storage';
import { ThroughputTextGame, formatAction } from '../cli';
import type { ThroughputAction } from '../cli';
import type { ThroughputRun } from '../rules';

const KEY = 'throughput.run';

export type RestoredRun =
  | { readonly ok: true; readonly run: ThroughputRun; readonly autosave: RunAutosave }
  /** The stored run no longer replays (e.g. the rules changed since); it has been cleared. */
  | { readonly ok: false; readonly reason: string };

/**
 * The browser's autosave: the run kept as a CLI save (seed plus the canonical text of every
 * action), written after each action. The engine is deterministic, so replaying it rebuilds the
 * exact run after a refresh, and the same save plays on in the CLI.
 */
export class RunAutosave {
  private readonly store: KeyValueStore;
  private save_: SaveFile;

  private constructor(store: KeyValueStore, save: SaveFile) {
    this.store = store;
    this.save_ = save;
  }

  /** Starts a fresh autosave for a run from `seed`, replacing any stored run. */
  static start(store: KeyValueStore, seed: number): RunAutosave {
    const autosave = new RunAutosave(store, new ThroughputTextGame().newSave(seed));
    autosave.write();
    return autosave;
  }

  /** The stored run rebuilt by replay, or null if none is stored. A save that won't replay is cleared. */
  static restore(store: KeyValueStore): RestoredRun | null {
    const text = store.get(KEY);
    if (text === null) return null;
    try {
      const save = parseSave(text);
      return { ok: true, run: new ThroughputTextGame().replay(save), autosave: new RunAutosave(store, save) };
    } catch (error) {
      store.remove(KEY);
      return { ok: false, reason: error instanceof SaveError ? error.message : String(error) };
    }
  }

  get save(): SaveFile {
    return this.save_;
  }

  /** Appends an action the run just accepted. Hand numbers are stable positions (see `handNumber`). */
  record(action: ThroughputAction): void {
    this.save_ = { ...this.save_, actions: [...this.save_.actions, formatAction(action)] };
    this.write();
  }

  /** Forgets the stored run (it ended, or the player started another). */
  clear(): void {
    this.store.remove(KEY);
  }

  private write(): void {
    this.store.set(KEY, serializeSave(this.save_));
  }
}

/** The stable hand position (what the CLI's hand numbers name) of `run.hand[index]`. */
export function handNumber(run: ThroughputRun, index: number): number {
  const card = run.hand[index];
  return card === undefined ? -1 : run.handSlots.indexOf(card);
}
