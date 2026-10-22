import { describe, expect, it } from 'vitest';
import { EngineError } from '../errors';
import { Registry } from '../registry';
import type { ContentDef } from '../registry';
import { Rng } from '../rng';

const weights = { common: 10, rare: 1, never: 0 };
const def = (id: string, rarity: string, extra: Partial<ContentDef> = {}): ContentDef => ({ id, rarity, price: 3, ...extra });

describe('Registry', () => {
  it('registers and looks up by id', () => {
    const registry = new Registry(weights);
    const a = def('a', 'common');
    registry.register(a);
    expect(registry.has('a')).toBe(true);
    expect(registry.get('a')).toBe(a);
    expect(registry.all()).toEqual([a]);
    expect(() => registry.get('missing')).toThrow(EngineError);
  });

  it('rejects duplicate ids and unknown rarities', () => {
    const registry = new Registry(weights);
    registry.register(def('a', 'common'));
    expect(() => registry.register(def('a', 'rare'))).toThrow(EngineError);
    expect(() => registry.register(def('b', 'mythic'))).toThrow(EngineError);
  });

  it('uses rarity weights unless a definition overrides them', () => {
    const registry = new Registry(weights);
    expect(registry.weightOf(def('a', 'rare'))).toBe(1);
    expect(registry.weightOf(def('b', 'rare', { weight: 7 }))).toBe(7);
  });

  it('pick() is weighted, respects filters, and skips zero weight', () => {
    const registry = new Registry(weights);
    registry.register(def('c', 'common'));
    registry.register(def('r', 'rare'));
    registry.register(def('n', 'never'));
    const rng = new Rng(4);
    const counts: Record<string, number> = { c: 0, r: 0, n: 0 };
    for (let i = 0; i < 2000; i++) {
      const picked = registry.pick(rng);
      if (picked) counts[picked.id] = (counts[picked.id] ?? 0) + 1;
    }
    expect(counts.n).toBe(0);
    expect(counts.c).toBeGreaterThan((counts.r ?? 0) * 5);
    expect(registry.pick(rng, (d) => d.id === 'r')?.id).toBe('r');
    expect(registry.pick(rng, (d) => d.id === 'n')).toBeUndefined();
  });
});
