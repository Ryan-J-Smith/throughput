// Test fixture: the smallest possible non-Run TextGame.
import { ReplayTextGame } from '../session';
import type { GameView, ReplayStep, SaveFile } from '../session';

type Counter = { value: number; readonly seed: number };

/** Minimal non-Run game: "add N" changes state, "peek" is a read-only query. */
export class CounterGame extends ReplayTextGame<Counter> {
  readonly name = 'counter';

  protected override start(seed: number): Counter {
    return { value: seed, seed };
  }

  protected override step(state: Counter, text: string): ReplayStep {
    const [verb, arg] = text.trim().split(/\s+/);
    if (verb === 'peek') return { ok: true, log: [`value is ${state.value}`], record: null };
    const n = Number(arg);
    if (verb !== 'add' || !Number.isInteger(n)) return { ok: false, reason: 'expected "add N" or "peek"' };
    if (state.value + n > 100) return { ok: false, reason: 'would exceed 100' };
    state.value += n;
    return { ok: true, log: [`added ${n}`], record: `add ${n}` };
  }

  protected override describe(state: Counter, save: SaveFile): GameView {
    return {
      text: `value ${state.value} after ${save.actions.length} actions`,
      legalActions: ['add N', 'peek'],
      state: { value: state.value },
    };
  }
}
