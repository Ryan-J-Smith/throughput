import { describe, expect, it } from 'vitest';
import { EngineError } from '../errors';
import { ModifierBus } from '../modifiers';
import type { EngineEvent } from '../modifiers';
import { HookModifier, RecordingModifier, makeRun } from './fakes';
import type { TestCard } from './fakes';

const shopEnter = (): EngineEvent<TestCard> => ({ type: 'shopEnter', run: makeRun() });

describe('ModifierBus', () => {
  it('delivers events in slot order', () => {
    const log: string[] = [];
    const bus = new ModifierBus<TestCard>(3);
    bus.add(new RecordingModifier('a', log));
    bus.add(new RecordingModifier('b', log));
    bus.add(new RecordingModifier('c', log), 0);
    bus.emit(shopEnter());
    expect(log).toEqual(['c:shopEnter', 'a:shopEnter', 'b:shopEnter']);
  });

  it('move() reorders slots, which changes outcomes', () => {
    const log: string[] = [];
    const bus = new ModifierBus<TestCard>(3);
    const a = new RecordingModifier('a', log);
    const b = new RecordingModifier('b', log);
    bus.add(a);
    bus.add(b);
    bus.move(0, 1);
    expect(bus.modifiers).toEqual([b, a]);
    bus.emit(shopEnter());
    expect(log).toEqual(['b:shopEnter', 'a:shopEnter']);
    expect(() => bus.move(0, 5)).toThrow(EngineError);
  });

  it('enforces capacity without evicting on shrink', () => {
    const bus = new ModifierBus<TestCard>(1);
    bus.add(new RecordingModifier('a', []));
    expect(bus.isFull).toBe(true);
    expect(() => bus.add(new RecordingModifier('b', []))).toThrow(EngineError);
    bus.capacity = 2;
    bus.add(new RecordingModifier('b', []));
    bus.capacity = 0;
    expect(bus.modifiers).toHaveLength(2);
  });

  it('remove() throws for modifiers not in a slot', () => {
    const bus = new ModifierBus<TestCard>(2);
    const a = new RecordingModifier('a', []);
    bus.add(a);
    bus.remove(a);
    expect(bus.modifiers).toHaveLength(0);
    expect(() => bus.remove(a)).toThrow(EngineError);
  });

  it('skips modifiers removed earlier in the same emission', () => {
    const log: string[] = [];
    const bus = new ModifierBus<TestCard>(3);
    const victim = new RecordingModifier('victim', log);
    bus.add(new HookModifier('killer', 'shopEnter', () => bus.remove(victim)));
    bus.add(victim);
    bus.emit(shopEnter());
    expect(log).toEqual([]);
  });
});
