import type { SoundCue } from './sound-player';

// Every cue is synthesized on the fly (no audio files): short oscillator and filtered-noise
// envelopes, kept quiet and brief so they sit under play rather than on top of it.

/** Schedules one cue on `out` starting at context time `at`; `step` raises a pitched cue up its scale. */
type Voice = (context: BaseAudioContext, out: AudioNode, at: number, intensity: number, step: number) => void;

/** Exponential ramps can't reach 0, so envelopes start and end here. */
const SILENT = 0.0001;

type Envelope = {
  readonly at: number;
  readonly peak: number;
  /** Seconds to the peak. */
  readonly attack: number;
  /** Seconds from the peak back to silence. */
  readonly decay: number;
};

function envelope(gain: AudioParam, { at, peak, attack, decay }: Envelope): void {
  gain.setValueAtTime(SILENT, at);
  gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.exponentialRampToValueAtTime(SILENT, at + attack + decay);
}

type Tone = Envelope & {
  readonly type?: OscillatorType;
  /** Hz at the start, gliding to `to` (if given) by the end. */
  readonly from: number;
  readonly to?: number;
};

function tone(context: BaseAudioContext, out: AudioNode, { type = 'sine', from, to, ...shape }: Tone): void {
  const end = shape.at + shape.attack + shape.decay;
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, shape.at);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, end);
  envelope(amp.gain, shape);
  osc.connect(amp).connect(out);
  osc.start(shape.at);
  osc.stop(end + 0.02);
}

type Noise = Envelope & {
  readonly filter: BiquadFilterType;
  /** Filter Hz at the start, sweeping to `to` (if given) by the end. */
  readonly from: number;
  readonly to?: number;
  readonly q?: number;
};

function noise(context: BaseAudioContext, out: AudioNode, { filter, from, to, q = 1, ...shape }: Noise): void {
  const end = shape.at + shape.attack + shape.decay;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context);
  const band = context.createBiquadFilter();
  band.type = filter;
  band.Q.value = q;
  band.frequency.setValueAtTime(from, shape.at);
  if (to !== undefined) band.frequency.exponentialRampToValueAtTime(to, end);
  const amp = context.createGain();
  envelope(amp.gain, shape);
  source.connect(band).connect(amp).connect(out);
  source.start(shape.at);
  source.stop(end + 0.02);
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Half a second of white noise per context, from a fixed xorshift sequence. */
function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const cached = noiseBuffers.get(context);
  if (cached !== undefined) return cached;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate / 2), context.sampleRate);
  const data = buffer.getChannelData(0);
  let x = 0x2545f491;
  for (let i = 0; i < data.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    data[i] = (x >>> 0) / 0x7fffffff - 1;
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}

/** Semitones of a major pentatonic within an octave, so runs of dings stay in key. */
const PENTATONIC = [0, 2, 4, 7, 9];
/** Intensity spans the first two octaves of the scale; `step` climbs from there, up to this many steps in all. */
const SALE_RANGE = 10;
const SALE_TOP = 14;
const SALE_BASE_HZ = 523.25; // C5

/** The ding's pitch for a sale of `intensity` (0 to 1), `step` notes further up the scale (a Shift's later sales). */
export function saleHz(intensity: number, step = 0): number {
  const note = Math.min(SALE_TOP, Math.round(intensity * (SALE_RANGE - 1)) + Math.max(0, step));
  const semitones = 12 * Math.floor(note / PENTATONIC.length) + (PENTATONIC[note % PENTATONIC.length] ?? 0);
  return SALE_BASE_HZ * 2 ** (semitones / 12);
}

/** C major, spread a little in time like a strum. */
const CHORD_HZ = [523.25, 659.25, 783.99, 1046.5];

export const VOICES: Readonly<Record<SoundCue, Voice>> = {
  select: (context, out, at) => {
    tone(context, out, { type: 'triangle', from: 1500, to: 1100, at, peak: 0.12, attack: 0.002, decay: 0.04 });
  },
  load: (context, out, at) => {
    tone(context, out, { from: 150, to: 58, at, peak: 0.5, attack: 0.004, decay: 0.17 });
    noise(context, out, { filter: 'lowpass', from: 1200, to: 300, at, peak: 0.12, attack: 0.002, decay: 0.05 });
  },
  slot: (context, out, at, intensity) => {
    noise(context, out, { filter: 'bandpass', from: 450, to: 1500, q: 0.9, at, peak: 0.1 + 0.14 * intensity, attack: 0.035, decay: 0.11 });
    tone(context, out, { from: 90, to: 70, at, peak: 0.08 * intensity + SILENT, attack: 0.01, decay: 0.06 });
  },
  sale: (context, out, at, intensity, step) => {
    const hz = saleHz(intensity, step);
    tone(context, out, { from: hz, at, peak: 0.16, attack: 0.002, decay: 0.5 });
    tone(context, out, { from: hz * 2.756, at, peak: 0.045, attack: 0.001, decay: 0.16 });
    tone(context, out, { type: 'triangle', from: hz * 2, at, peak: 0.03, attack: 0.002, decay: 0.25 });
  },
  hit: (context, out, at) => {
    tone(context, out, { from: 261.63, at, peak: 0.07, attack: 0.02, decay: 1.3 });
    CHORD_HZ.forEach((hz, i) => tone(context, out, { type: 'triangle', from: hz, at: at + i * 0.04, peak: 0.09, attack: 0.012, decay: 1.2 }));
  },
  miss: (context, out, at) => {
    tone(context, out, { from: 120, to: 42, at, peak: 0.55, attack: 0.006, decay: 0.4 });
    tone(context, out, { type: 'triangle', from: 80, to: 50, at, peak: 0.12, attack: 0.006, decay: 0.25 });
    noise(context, out, { filter: 'lowpass', from: 500, to: 150, at, peak: 0.1, attack: 0.003, decay: 0.12 });
  },
  buy: (context, out, at) => {
    tone(context, out, { from: 1318.51, at, peak: 0.17, attack: 0.003, decay: 0.28 });
    tone(context, out, { from: 1975.53, at: at + 0.075, peak: 0.15, attack: 0.003, decay: 0.42 });
    tone(context, out, { type: 'triangle', from: 2637.02, at: at + 0.075, peak: 0.02, attack: 0.002, decay: 0.1 });
  },
};
