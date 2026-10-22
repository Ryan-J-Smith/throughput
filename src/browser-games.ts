import { RunBrowserGame } from './app';
import { DemoGame } from './content/demo';
import { BomBrowserGame } from './games/bom/browser';
import { ThroughputBrowserGame } from './games/throughput/browser';
import { ThroughputQaBrowserGame } from './games/throughput/qa';
import { ArtGalleryBrowserGame } from './ui/gallery';
import type { BrowserGame } from './ui/games';

/**
 * Games on the title, in display order: the first `featured` game is the headline, the rest are
 * listed under More games (`dev` ones only in dev builds). Register a new game with one line here.
 */
export const BROWSER_GAMES: readonly BrowserGame[] = [
  new ThroughputBrowserGame(),
  new BomBrowserGame(),
  new RunBrowserGame({
    id: 'demo',
    title: 'Card demo',
    tagline: 'The original engine demo: play cards, chain modifiers, beat the target.',
    accent: 'teal',
    listing: 'dev',
    createGame: () => new DemoGame(),
  }),
  // Dev server only: review generated art and THROUGHPUT's visual states. Not even registered in
  // builds, so their chunks aren't emitted.
  ...(import.meta.env.DEV ? [new ArtGalleryBrowserGame(), new ThroughputQaBrowserGame()] : []),
];
