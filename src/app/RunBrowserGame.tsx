import { useState } from 'react';
import type { ComponentType } from 'react';
import { BrowserGame } from '../ui/games';
import type { BrowserGameProps, GameListing } from '../ui/games';
import { App } from '../ui/shell';
import { GameController } from './GameController';
import type { GameDefinition } from './GameDefinition';

export type RunBrowserGameSpec<TCard extends object> = {
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly accent?: string;
  readonly listing?: GameListing;
  /** A fresh game definition per launch. */
  readonly createGame: () => GameDefinition<TCard>;
};

/**
 * Puts any engine-Run game (a GameDefinition) on the picker: each launch gets its own
 * GameController, starts straight into round 1, and later "New run"s take fresh clock seeds.
 */
export class RunBrowserGame<TCard extends object> extends BrowserGame {
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  override readonly accent: string;
  override readonly listing: GameListing;
  readonly Screen: ComponentType<BrowserGameProps>;

  constructor(spec: RunBrowserGameSpec<TCard>) {
    super();
    this.id = spec.id;
    this.title = spec.title;
    this.tagline = spec.tagline;
    this.accent = spec.accent ?? 'neutral';
    this.listing = spec.listing ?? 'featured';
    this.Screen = function RunGameScreen({ seed }: BrowserGameProps) {
      const [controller] = useState(() => {
        let first = true;
        const nextSeed = () => (first ? ((first = false), seed) : Date.now());
        const created = new GameController(spec.createGame(), nextSeed);
        created.onStart();
        return created;
      });
      return <App model={controller} />;
    };
  }
}
