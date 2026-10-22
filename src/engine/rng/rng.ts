import { EngineError } from '../errors';

/** FNV-1a 32-bit hash; turns string seeds and fork labels into uint32 seeds. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Seedable deterministic PRNG (mulberry32). All engine randomness goes through this —
 * never Math.random — so a run is fully reproducible from its seed.
 */
export class Rng {
  /** The uint32 seed this stream started from. */
  readonly seed: number;
  private state: number;

  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.state = this.seed;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max], inclusive at both ends. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new EngineError(`Rng.int: invalid range [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Uniformly chosen element. Throws on an empty list. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new EngineError('Rng.pick: empty list');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Fisher–Yates shuffle into a new array; the input is not modified. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /**
   * Element chosen with probability proportional to `weight(item)`.
   * Weights must be finite and non-negative, with a positive total.
   */
  weightedPick<T>(items: readonly T[], weight: (item: T) => number): T {
    const weights = items.map(weight);
    let total = 0;
    for (const w of weights) {
      if (!Number.isFinite(w) || w < 0) throw new EngineError(`Rng.weightedPick: invalid weight ${w}`);
      total += w;
    }
    if (total <= 0) throw new EngineError('Rng.weightedPick: total weight must be positive');
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      const w = weights[i] as number;
      if (w === 0) continue;
      roll -= w;
      if (roll < 0) return items[i] as T;
    }
    // Floating-point leftovers: fall back to the last item with positive weight.
    for (let i = items.length - 1; i >= 0; i--) {
      if ((weights[i] as number) > 0) return items[i] as T;
    }
    throw new EngineError('Rng.weightedPick: unreachable');
  }

  /**
   * Independent substream derived from this stream's seed and `label` (not its current state),
   * so e.g. the shop stream is unaffected by how many cards the deck stream has drawn.
   * Forking the same label twice yields identical streams.
   */
  fork(label: string): Rng {
    return new Rng(hashString(`${this.seed}/${label}`));
  }
}
