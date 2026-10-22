import { describe, expect, it } from 'vitest';
import { SOUND_CUES, WebAudioPlayer, saleHz, volumeGain } from '.';

// A stand-in for the slice of the Web Audio API the player uses: it records what gets made,
// started and changed, and plays nothing.

class FakeParam {
  value = 0;
  setValueAtTime(value: number, _time: number) {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(_value: number, _time: number) {
    return this;
  }
  setTargetAtTime(value: number, _time: number, _constant: number) {
    this.value = value;
    return this;
  }
}

class FakeNode {
  readonly connections: FakeNode[] = [];
  connect(node: FakeNode) {
    this.connections.push(node);
    return node;
  }
}

class FakeSource extends FakeNode {
  type = '';
  buffer: unknown = null;
  readonly frequency = new FakeParam();
  readonly starts: number[] = [];
  start(time: number) {
    this.starts.push(time);
  }
  stop(_time: number) {}
}

class FakeContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 10;
  readonly sampleRate = 8000;
  readonly destination = new FakeNode();
  readonly gains: (FakeNode & { gain: FakeParam })[] = [];
  readonly sources: FakeSource[] = [];
  resumes = 0;
  suspends = 0;
  /** Set to hold resumes until `finishResume`, as browsers do. */
  deferResume = false;
  private pending: (() => void) | null = null;

  createGain() {
    const node = Object.assign(new FakeNode(), { gain: new FakeParam() });
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    return this.source();
  }
  createBufferSource() {
    return this.source();
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: '', Q: new FakeParam(), frequency: new FakeParam() });
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam() });
  }
  createBuffer(_channels: number, length: number, _rate: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume() {
    this.resumes++;
    if (!this.deferResume) {
      this.state = 'running';
      return Promise.resolve();
    }
    return new Promise<void>((done) => {
      this.pending = () => {
        this.state = 'running';
        done();
      };
    });
  }
  finishResume() {
    this.pending?.();
    this.pending = null;
  }
  suspend() {
    this.suspends++;
    this.state = 'suspended';
    return Promise.resolve();
  }

  private source() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

/** Lets pending promise callbacks run, as they would between two clicks. */
const nextEvent = () => new Promise((done) => setTimeout(done, 0));

/** A player over a FakeContext, counting how many contexts it asked for. */
function setup(available = true) {
  const context = new FakeContext();
  let created = 0;
  const player = new WebAudioPlayer(() => {
    created++;
    return available ? (context as unknown as AudioContext) : null;
  });
  return { player, context, created: () => created };
}

describe('WebAudioPlayer', () => {
  it('makes no AudioContext before a gesture unlocks it, nor while sound is off', () => {
    const { player, context, created } = setup();
    player.play('select');
    player.unlock();
    expect(created()).toBe(0);

    player.configure(false, 0.4);
    player.unlock();
    expect(created()).toBe(0);

    player.configure(true, 0.4);
    player.play('select');
    expect(created()).toBe(0);

    player.unlock();
    player.unlock();
    expect(created()).toBe(1);
    expect(context.resumes).toBe(1);
    expect(context.state).toBe('running');
  });

  it('plays every cue at its delay through a master gain set from the volume', () => {
    const { player, context } = setup();
    player.configure(true, 0.5);
    player.unlock();
    expect(context.gains[0]?.gain.value).toBe(volumeGain(0.5));

    for (const cue of SOUND_CUES) {
      const before = context.sources.length;
      player.play(cue, { delayMs: 500 });
      const started = context.sources.slice(before).flatMap((s) => s.starts);
      expect(started.length, cue).toBeGreaterThan(0);
      expect(Math.min(...started), cue).toBe(10.5);
    }

    player.configure(true, 1);
    expect(context.gains[0]?.gain.value).toBe(1);
  });

  it('turning sound off suspends audio and silences cues; turning it on resumes at the next unlock', async () => {
    const { player, context } = setup();
    player.configure(true, 0.4);
    player.unlock();
    await nextEvent();
    player.configure(false, 0.4);
    expect(context.suspends).toBe(1);
    const before = context.sources.length;
    player.play('buy');
    expect(context.sources.length).toBe(before);

    player.configure(true, 0.4);
    player.unlock();
    expect(context.resumes).toBe(2);
    player.play('buy');
    expect(context.sources.length).toBeGreaterThan(before);
  });

  it('cues played while the context is still resuming are kept, and a mute during the resume wins', async () => {
    const { player, context } = setup();
    context.deferResume = true;
    player.configure(true, 0.4);
    player.unlock();
    player.unlock();
    expect(context.resumes).toBe(1);
    player.play('select');
    expect(context.sources).toHaveLength(1);

    player.configure(false, 0.4);
    context.finishResume();
    await nextEvent();
    expect(context.state).toBe('suspended');
    expect(context.suspends).toBe(1);
  });

  it('gives up quietly where the browser has no Web Audio', () => {
    const { player, created } = setup(false);
    player.configure(true, 0.4);
    player.unlock();
    player.unlock();
    player.play('hit');
    expect(created()).toBe(1);
  });
});

describe('sound tuning', () => {
  it('volume is squared and clamped; sale dings rise in pitch with size', () => {
    expect(volumeGain(0.4)).toBeCloseTo(0.16);
    expect(volumeGain(-1)).toBe(0);
    expect(volumeGain(3)).toBe(1);
    expect(volumeGain(Number.NaN)).toBe(0);
    expect(saleHz(0)).toBeCloseTo(523.25);
    expect(saleHz(0.5)).toBeGreaterThan(saleHz(0.2));
    expect(saleHz(1)).toBeGreaterThan(saleHz(0.5));
    expect(saleHz(1)).toBeCloseTo(523.25 * 2 ** (21 / 12));
  });

  it('each step climbs one note of the pentatonic scale, up to a top note', () => {
    expect(saleHz(0, 0)).toBe(saleHz(0));
    expect(saleHz(0, -3)).toBe(saleHz(0));
    expect(saleHz(0, 1)).toBeCloseTo(523.25 * 2 ** (2 / 12));
    expect(saleHz(0, 3)).toBeCloseTo(523.25 * 2 ** (7 / 12));
    expect(saleHz(0, 5)).toBeCloseTo(523.25 * 2);
    expect(saleHz(0.5, 2)).toBeGreaterThan(saleHz(0.5, 1));
    // The top note (two octaves and a sixth up) is as high as a run of sales climbs.
    expect(saleHz(1, 5)).toBeCloseTo(523.25 * 2 ** (33 / 12));
    expect(saleHz(0, 40)).toBe(saleHz(1, 5));
  });

  it('a sale cue sounds at its step up the scale', () => {
    const { player, context } = setup();
    player.configure(true, 0.4);
    player.unlock();
    player.play('sale', { intensity: 0 });
    player.play('sale', { intensity: 0, step: 3 });
    const [first, , , second] = context.sources;
    expect(first?.frequency.value).toBeCloseTo(saleHz(0));
    expect(second?.frequency.value).toBeCloseTo(saleHz(0, 3));
  });
});
