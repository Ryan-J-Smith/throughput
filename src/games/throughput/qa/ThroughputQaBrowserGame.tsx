import { Suspense, lazy } from 'react';
import { BrowserGame } from '../../../ui/games';
import type { BrowserGameProps } from '../../../ui/games';

// Loaded on demand: the QA screen and its scripted run stay out of the game's bundle.
const ThroughputQa = /* @__PURE__ */ lazy(() => import('./ThroughputQa').then((m) => ({ default: m.ThroughputQa })));

function ThroughputQaScreen(props: BrowserGameProps) {
  return (
    <Suspense fallback={<p className="section-label">Loading QA…</p>}>
      <ThroughputQa {...props} />
    </Suspense>
  );
}

/** Dev-only visual QA for THROUGHPUT's Line, receipt, shop art and Boards; registered behind import.meta.env.DEV. */
export class ThroughputQaBrowserGame extends BrowserGame {
  readonly id = 'throughput-qa';
  readonly title = 'THROUGHPUT visual QA (dev)';
  readonly tagline = 'Every bay state, the receipt, and every shop item and Board with its art. Not in production builds.';
  override readonly accent = 'blue';
  override readonly listing = 'dev';
  readonly Screen = ThroughputQaScreen;
}
