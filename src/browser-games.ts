import { RunBrowserGame } from './app';
import { DemoGame } from './content/demo';
import type { BrowserGame } from './ui/games';

/** Games on the title screen's picker, in display order. Register a new game with one line here. */
export const BROWSER_GAMES: readonly BrowserGame[] = [
  new RunBrowserGame({
    id: 'demo',
    title: 'Card demo',
    tagline: 'The original engine demo: play cards, chain modifiers, beat the target.',
    accent: 'teal',
    createGame: () => new DemoGame(),
  }),
];
