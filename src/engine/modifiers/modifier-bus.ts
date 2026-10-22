import { EngineError } from '../errors';
import type { EngineEvent } from './events';
import type { Modifier } from './modifier';

/**
 * The player's ordered modifier slots and the event bus that drives them.
 * Events reach modifiers left to right, so slot order changes outcomes.
 */
export class ModifierBus<TCard> {
  private readonly slots: Modifier<TCard>[] = [];
  private capacity_: number;

  constructor(capacity: number) {
    this.capacity_ = ModifierBus.validCapacity(capacity);
  }

  get modifiers(): readonly Modifier<TCard>[] {
    return this.slots;
  }

  get capacity(): number {
    return this.capacity_;
  }

  /** Changing capacity never evicts modifiers; it only limits future additions. */
  set capacity(capacity: number) {
    this.capacity_ = ModifierBus.validCapacity(capacity);
  }

  get isFull(): boolean {
    return this.slots.length >= this.capacity_;
  }

  /** Inserts at `index` (default: rightmost slot). */
  add(modifier: Modifier<TCard>, index: number = this.slots.length): void {
    if (this.isFull) throw new EngineError('ModifierBus: no free slot');
    if (index < 0 || index > this.slots.length) throw new EngineError(`ModifierBus: invalid index ${index}`);
    this.slots.splice(index, 0, modifier);
  }

  remove(modifier: Modifier<TCard>): void {
    const i = this.slots.indexOf(modifier);
    if (i < 0) throw new EngineError('ModifierBus: modifier not in a slot');
    this.slots.splice(i, 1);
  }

  /** Moves the modifier at slot `from` to slot `to`. */
  move(from: number, to: number): void {
    const n = this.slots.length;
    if (from < 0 || from >= n || to < 0 || to >= n) throw new EngineError(`ModifierBus: invalid move ${from}→${to}`);
    const [modifier] = this.slots.splice(from, 1);
    this.slots.splice(to, 0, modifier as Modifier<TCard>);
  }

  /**
   * Delivers `event` to each modifier in slot order. Iterates a snapshot; a modifier removed
   * by an earlier one during the same emission is skipped.
   */
  emit(event: EngineEvent<TCard>): void {
    for (const modifier of [...this.slots]) {
      if (this.slots.includes(modifier)) modifier.onEvent(event);
    }
  }

  private static validCapacity(capacity: number): number {
    if (!Number.isInteger(capacity) || capacity < 0) throw new EngineError(`ModifierBus: invalid capacity ${capacity}`);
    return capacity;
  }
}
