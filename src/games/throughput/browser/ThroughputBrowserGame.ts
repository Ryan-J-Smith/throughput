import { BrowserGame } from '../../../ui/games';
import { ThroughputScreen } from './ThroughputScreen';

export class ThroughputBrowserGame extends BrowserGame {
  readonly id = 'throughput';
  readonly title = 'Throughput';
  readonly tagline = 'Run a factory line: load Designs, Makes and Ships into bays, ride the trends, and ship before the quarter closes.';
  override readonly accent = 'blue';
  readonly Screen = ThroughputScreen;
}
