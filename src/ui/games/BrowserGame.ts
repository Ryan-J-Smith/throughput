import type { ComponentType } from 'react';
import type { SoundPlayer } from '../sound';
import type { KeyValueStore } from '../storage';

export type BrowserGameProps = {
  /** Seed for this session's first run. */
  readonly seed: number;
  /** Returns to the game picker. */
  readonly onQuit: () => void;
  /** Where the game keeps its autosave and preferences. */
  readonly store: KeyValueStore;
  /** True to continue the autosaved run (see `BrowserGame.savedRun`) instead of starting one from `seed`. */
  readonly resume: boolean;
  /** Plays the game's sound cues; silent if omitted. */
  readonly sound?: SoundPlayer;
};

/** Where the title lists a game: the headline game, a "Prototype:" entry under More games, or dev builds only. */
export type GameListing = 'featured' | 'prototype' | 'dev';

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
  /** Where the title lists this game. */
  readonly listing: GameListing = 'featured';
  /** A short how-to-play the title can show before a run; null if the game has none. */
  readonly HowToPlay: ComponentType | null = null;
  /** The whole game UI for one session; mounted fresh for each launch. */
  abstract readonly Screen: ComponentType<BrowserGameProps>;

  /** A short description of the autosaved run that `resume` would continue, or null if there is none. */
  savedRun(_store: KeyValueStore): string | null {
    return null;
  }

  /** True if the game has first-run tips that `resetTips` can bring back. */
  readonly hasTips: boolean = false;

  /** Shows the game's first-run tips again. */
  resetTips(_store: KeyValueStore): void {}
}
