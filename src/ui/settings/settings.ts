import type { KeyValueStore } from '../storage';

export type AnimationSpeed = 'slow' | 'normal' | 'fast';
export const ANIMATION_SPEEDS: readonly AnimationSpeed[] = ['slow', 'normal', 'fast'];

/** Player preferences for how the UI moves. */
export type Settings = {
  /** Scales animation and tally durations. */
  readonly speed: AnimationSpeed;
  /** Reduce motion even if the device doesn't ask for it. */
  readonly reduceMotion: boolean;
};

export const DEFAULT_SETTINGS: Settings = { speed: 'normal', reduceMotion: false };

/** Duration multiplier per speed. */
export const SPEED_SCALE: Readonly<Record<AnimationSpeed, number>> = { slow: 1.5, normal: 1, fast: 0.5 };

const KEY = 'settings';

/** Settings kept in a KeyValueStore; anything unreadable falls back to the defaults. */
export class SettingsStore {
  private readonly store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  load(): Settings {
    const text = this.store.get(KEY);
    if (text === null) return DEFAULT_SETTINGS;
    try {
      const data = JSON.parse(text) as Partial<Record<keyof Settings, unknown>>;
      const speed = ANIMATION_SPEEDS.find((s) => s === data.speed) ?? DEFAULT_SETTINGS.speed;
      const reduceMotion = typeof data.reduceMotion === 'boolean' ? data.reduceMotion : DEFAULT_SETTINGS.reduceMotion;
      return { speed, reduceMotion };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  save(settings: Settings): void {
    this.store.set(KEY, JSON.stringify(settings));
  }
}

/** The part of the page element that settings are written to (document.documentElement in the app). */
export type SettingsTarget = { readonly dataset: DOMStringMap };

/**
 * Puts settings on the page root as data-speed and data-motion, which settings.css turns into
 * duration tokens and a motion kill-switch, and which ui/motion reads for JS animations.
 */
export function applySettings(settings: Settings, root: SettingsTarget): void {
  root.dataset.speed = settings.speed;
  if (settings.reduceMotion) root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
}
