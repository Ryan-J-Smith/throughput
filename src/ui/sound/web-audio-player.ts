import { SoundPlayer } from './sound-player';
import type { CueOptions, SoundCue } from './sound-player';
import { VOICES } from './voices';

/** Makes the AudioContext, or null where the browser has no Web Audio. */
export type AudioContextFactory = () => AudioContext | null;

export const browserAudioContext: AudioContextFactory = () => {
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (Context === undefined) return null;
  try {
    return new Context();
  } catch {
    return null;
  }
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** The master gain for a volume setting: squared, so the slider feels even to the ear. */
export function volumeGain(volume: number): number {
  return clamp01(volume) ** 2;
}

/**
 * Synthesizes cues with Web Audio. The AudioContext is created by the first `unlock` while sound
 * is on (so never before a user gesture, and never while muted), and suspended when sound is
 * turned off. Everything goes through one master gain and a gentle limiter.
 */
export class WebAudioPlayer extends SoundPlayer {
  private readonly createContext: AudioContextFactory;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The browser has no Web Audio; stop trying. */
  private unavailable = false;
  /** A resume is in flight: cues scheduled now still play, since context time waits for it. */
  private resuming = false;
  private enabled = false;
  private volume = 0;

  constructor(createContext: AudioContextFactory = browserAudioContext) {
    super();
    this.createContext = createContext;
  }

  play(cue: SoundCue, options: CueOptions = {}): void {
    const { context, master } = this;
    if (!this.enabled || context === null || master === null) return;
    if (context.state !== 'running' && !this.resuming) return;
    const at = context.currentTime + Math.max(0, options.delayMs ?? 0) / 1000;
    VOICES[cue](context, master, at, clamp01(options.intensity ?? 1));
  }

  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled;
    this.volume = clamp01(volume);
    const { context, master } = this;
    if (context === null || master === null) return;
    master.gain.setTargetAtTime(volumeGain(this.volume), context.currentTime, 0.015);
    if (!enabled && context.state === 'running') void context.suspend();
  }

  unlock(): void {
    if (!this.enabled || this.unavailable) return;
    if (this.context === null) {
      const context = this.createContext();
      if (context === null) {
        this.unavailable = true;
        return;
      }
      const master = context.createGain();
      master.gain.value = volumeGain(this.volume);
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 12;
      limiter.ratio.value = 4;
      master.connect(limiter).connect(context.destination);
      this.context = context;
      this.master = master;
    }
    if (this.context.state === 'suspended' && !this.resuming) this.resume(this.context);
  }

  private resume(context: AudioContext): void {
    this.resuming = true;
    const settle = () => {
      this.resuming = false;
      // Sound was turned off while it resumed.
      if (!this.enabled && context.state === 'running') void context.suspend();
    };
    context.resume().then(settle, settle);
  }
}
