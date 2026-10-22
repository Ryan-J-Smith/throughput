import { BrowserGame } from '../../../ui/games';
import type { KeyValueStore } from '../../../ui/storage';
import { HowToPlay } from './HowToPlay';
import { runProgressLabel } from './present';
import { RunAutosave } from './run-autosave';
import { ThroughputScreen } from './ThroughputScreen';

export class ThroughputBrowserGame extends BrowserGame {
  readonly id = 'throughput';
  readonly title = 'Throughput';
  readonly tagline = 'Run a factory line: load Designs, Makes and Ships into bays, ride the trends, and ship before the quarter closes.';
  override readonly accent = 'blue';
  readonly Screen = ThroughputScreen;
  override readonly HowToPlay = HowToPlay;

  override savedRun(store: KeyValueStore): string | null {
    const restored = RunAutosave.restore(store);
    if (restored?.ok !== true) return null;
    const { phase } = restored.run;
    return phase === 'shift' || phase === 'shop' ? runProgressLabel(restored.run) : null;
  }
}
