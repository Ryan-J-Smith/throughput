/** The moments that make a sound. */
export type SoundCue =
  /** A soft click: a card, offer or Fixture picked up. */
  | 'select'
  /** A thunk: a card loaded into a bay. */
  | 'load'
  /** A short roll: the Batch passing one slot. */
  | 'slot'
  /** A register ding: a sale; higher for bigger ones. */
  | 'sale'
  /** A chord: the round's target hit. */
  | 'hit'
  /** A low thud: the target missed. */
  | 'miss'
  /** A two-note chime: a purchase. */
  | 'buy';

export const SOUND_CUES: readonly SoundCue[] = ['select', 'load', 'slot', 'sale', 'hit', 'miss', 'buy'];

export type CueOptions = {
  /** Milliseconds from now, so a caller can lay out a whole sequence at once. */
  readonly delayMs?: number;
  /** 0 to 1: how big the moment is (a sale's pitch, a slot's weight). Defaults to 1. */
  readonly intensity?: number;
};

/**
 * Plays sound cues. The app gives screens a WebAudioPlayer; tests and anything without audio get
 * a SilentPlayer, so callers never need to check.
 */
export abstract class SoundPlayer {
  /** Plays `cue`, or does nothing while sound is off or not yet unlocked. */
  abstract play(cue: SoundCue, options?: CueOptions): void;

  /** Turns sound on or off and sets its volume, from 0 to 1. */
  abstract configure(enabled: boolean, volume: number): void;

  /** Starts audio if sound is on. Call it from a user gesture: browsers block audio until one. */
  abstract unlock(): void;
}

/** A player that plays nothing. */
export class SilentPlayer extends SoundPlayer {
  play(_cue: SoundCue, _options?: CueOptions): void {}

  configure(_enabled: boolean, _volume: number): void {}

  unlock(): void {}
}
