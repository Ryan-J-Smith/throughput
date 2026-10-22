import { BrowserGame } from '../../../ui/games';
import type { KeyValueStore } from '../../../ui/storage';
import { HowToPlay } from './HowToPlay';
import { runProgressLabel } from './present';
import { RunAutosave } from './run-autosave';
import { TipMemory } from './tips';
import { ThroughputScreen } from './ThroughputScreen';

export class ThroughputBrowserGame extends BrowserGame {
  readonly id = 'throughput';
  readonly title = 'Throughput';
  readonly tagline = 'Run a factory line: load Designs, Makes and Ships into bays, ride the trends, and ship before the quarter closes.';
  override readonly accent = 'blue';
  readonly Screen = ThroughputScreen;
  override readonly HowToPlay = HowToPlay;

  override readonly hasTips = true;

  override resetTips(store: KeyValueStore): void {
    new TipMemory(store).reset();
  }

  override savedRun(store: KeyValueStore): string | null {
    const restored = RunAutosave.restore(store);
    if (restored?.ok !== true) return null;
    const run = restored.run;
    // A won run can still keep going (endless).
    if (run.phase === 'won') return `Won the run: keep going into Year ${run.quarterOf(run.round + 1).year}`;
    return run.phase === 'shift' || run.phase === 'shop' ? runProgressLabel(run) : null;
  }
}
