import { describe, expect, it } from 'vitest';
import { EngineError } from '../errors';
import { Rng, hashString } from '../rng';

const sequence = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.next());

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    expect(sequence(new Rng(42), 10)).toEqual(sequence(new Rng(42), 10));
    expect(sequence(new Rng(42), 10)).not.toEqual(sequence(new Rng(43), 10));
  });

  it('accepts string seeds via hashString', () => {
    expect(new Rng('abc').seed).toBe(hashString('abc'));
    expect(sequence(new Rng('abc'), 5)).toEqual(sequence(new Rng(hashString('abc')), 5));
  });

  it('next() stays in [0, 1)', () => {
    for (const x of sequence(new Rng(1), 1000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int() is inclusive and covers the whole range', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
    expect(rng.int(3, 3)).toBe(3);
  });

  it('int() rejects bad ranges', () => {
    const rng = new Rng(1);
    expect(() => rng.int(5, 2)).toThrow(EngineError);
    expect(() => rng.int(0.5, 2)).toThrow(EngineError);
  });

  it('pick() returns a member and throws on empty', () => {
    const rng = new Rng(3);
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    expect(() => rng.pick([])).toThrow(EngineError);
  });

  it('shuffle() permutes into a new array without mutating input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = new Rng(9).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(new Rng(9).shuffle(input)).toEqual(out);
  });

  it('weightedPick() follows weights and never picks zero weight', () => {
    const rng = new Rng(11);
    const counts = { a: 0, b: 0, z: 0 };
    const weights = { a: 3, b: 1, z: 0 };
    const keys = ['a', 'b', 'z'] as const;
    for (let i = 0; i < 4000; i++) counts[rng.weightedPick(keys, (k) => weights[k])]++;
    expect(counts.z).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.5);
    expect(counts.a / counts.b).toBeLessThan(3.5);
  });

  it('weightedPick() rejects invalid weights', () => {
    const rng = new Rng(1);
    expect(() => rng.weightedPick([1, 2], () => 0)).toThrow(EngineError);
    expect(() => rng.weightedPick([1], () => -1)).toThrow(EngineError);
    expect(() => rng.weightedPick([1], () => Number.NaN)).toThrow(EngineError);
  });

  it('fork() gives labelled streams independent of parent consumption', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    sequence(b, 50);
    expect(sequence(a.fork('shop'), 5)).toEqual(sequence(b.fork('shop'), 5));
    expect(sequence(a.fork('shop'), 5)).not.toEqual(sequence(a.fork('deck'), 5));
    expect(sequence(a.fork('shop'), 5)).not.toEqual(sequence(new Rng(5), 5));
  });
});
