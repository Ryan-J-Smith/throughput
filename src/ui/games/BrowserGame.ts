import type { ComponentType } from 'react';

export type BrowserGameProps = {
  /** Seed for this session's first run. */
  readonly seed: number;
  /** Returns to the game picker. */
  readonly onQuit: () => void;
};

/**
 * A game the browser can launch from the title's game picker. Each game renders all of its own
 * screens; the launcher only picks the game and the seed, and draws an "All games" bar above it.
 * Register instances in src/browser-games.ts (one line per game).
 */
export abstract class BrowserGame {
  /** Stable key, e.g. "throughput". */
  abstract readonly id: string;
  /** Name on the picker. */
  abstract readonly title: string;
  /** One line under the name on the picker. */
  abstract readonly tagline: string;
  /** Department colour key from theme/tokens.css (red, blue, mustard, green, teal, violet, orange). */
  readonly accent: string = 'neutral';
  /** The whole game UI for one session; mounted fresh for each launch. */
  abstract readonly Screen: ComponentType<BrowserGameProps>;
}
