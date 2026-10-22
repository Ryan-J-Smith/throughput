import { describe, expect, it } from 'vitest';
import { toggleSelection } from '../selection';

describe('toggleSelection', () => {
  it('adds an unselected id', () => {
    expect(toggleSelection(['a'], 'b', 3)).toEqual(['a', 'b']);
  });

  it('removes a selected id', () => {
    expect(toggleSelection(['a', 'b'], 'a', 3)).toEqual(['b']);
  });

  it('refuses to add beyond max', () => {
    const full = ['a', 'b'];
    expect(toggleSelection(full, 'c', 2)).toBe(full);
  });

  it('still allows deselecting at max', () => {
    expect(toggleSelection(['a', 'b'], 'b', 2)).toEqual(['a']);
  });
});
