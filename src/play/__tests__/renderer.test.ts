import { describe, expect, it } from 'vitest';
import { GenericRenderer } from '../render';

class Widget {
  toString(): string {
    return 'widget!';
  }
}

describe('GenericRenderer', () => {
  it('uses a custom toString, else JSON, else String', () => {
    expect(new GenericRenderer<Widget>().card(new Widget())).toBe('widget!');
    expect(new GenericRenderer<{ value: number }>().card({ value: 7 })).toBe('{"value":7}');
    expect(new GenericRenderer<number>().card(7)).toBe('7');
  });

  it('renders card definitions by id', () => {
    const renderer = new GenericRenderer<number>();
    expect(renderer.cardDef({ kind: 'card', id: 'ten', rarity: 'common', price: 3, create: () => 10 })).toBe('card ten');
  });
});
