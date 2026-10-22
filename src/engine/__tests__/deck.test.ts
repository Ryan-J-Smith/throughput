import { describe, expect, it } from 'vitest';
import { Deck } from '../deck';
import { EngineError } from '../errors';
import { Rng } from '../rng';

type Card = { readonly name: string };
const cards = (n: number): Card[] => Array.from({ length: n }, (_, i) => ({ name: `c${i}` }));
const makeDeck = (n: number, handSize = 5, autoReshuffle = false): Deck<Card> =>
  new Deck(cards(n), new Rng(1), { handSize, autoReshuffle });

describe('Deck', () => {
  it('starts with everything shuffled into the draw pile', () => {
    const source = cards(10);
    const deck = new Deck(source, new Rng(1), { handSize: 5 });
    expect(deck.drawPile).toHaveLength(10);
    expect(deck.hand).toHaveLength(0);
    expect(new Set(deck.drawPile)).toEqual(new Set(source));
  });

  it('draws up to the hand size limit', () => {
    const deck = makeDeck(10);
    expect(deck.draw(3)).toHaveLength(3);
    expect(deck.draw(10)).toHaveLength(2);
    expect(deck.hand).toHaveLength(5);
    expect(deck.drawPile).toHaveLength(5);
    expect(deck.draw(1)).toEqual([]);
  });

  it('fillHand() stops when the draw pile is empty', () => {
    const deck = makeDeck(3);
    expect(deck.fillHand()).toHaveLength(3);
    expect(deck.drawPile).toHaveLength(0);
  });

  it('discard() and exhaust() move selected hand cards', () => {
    const deck = makeDeck(10);
    const [a, b, c] = deck.fillHand() as [Card, Card, Card];
    deck.discard([a, b]);
    deck.exhaust([c]);
    expect(deck.hand).toHaveLength(2);
    expect(deck.discardPile).toEqual([a, b]);
    expect(deck.exhaustPile).toEqual([c]);
  });

  it('rejects cards not in hand', () => {
    const deck = makeDeck(10);
    const notInHand = deck.drawPile[0] as Card;
    expect(deck.inHand([notInHand])).toBe(false);
    expect(() => deck.discard([notInHand])).toThrow(EngineError);
    const [a] = deck.draw(1) as [Card];
    expect(() => deck.discard([a, a])).toThrow(EngineError);
  });

  it('handles duplicate primitive cards by multiplicity', () => {
    const deck = new Deck(['x', 'x', 'y'], new Rng(2), { handSize: 3 });
    deck.fillHand();
    expect(deck.inHand(['x', 'x'])).toBe(true);
    deck.discard(['x']);
    expect(deck.hand.filter((c) => c === 'x')).toHaveLength(1);
  });

  it('reshuffleDiscardIntoDraw() puts discards under the draw pile', () => {
    const deck = makeDeck(8, 3);
    const hand = deck.fillHand();
    deck.discard(hand);
    const top = [...deck.drawPile];
    deck.reshuffleDiscardIntoDraw();
    expect(deck.discardPile).toHaveLength(0);
    expect(deck.drawPile).toHaveLength(8);
    expect(deck.drawPile.slice(3)).toEqual(top);
  });

  it('autoReshuffle refills the draw pile from discards', () => {
    const manual = makeDeck(4, 4);
    manual.discard(manual.fillHand().slice(0, 2));
    expect(manual.fillHand()).toHaveLength(0);

    const auto = makeDeck(4, 4, true);
    auto.discard(auto.fillHand().slice(0, 2));
    expect(auto.fillHand()).toHaveLength(2);
  });

  it('resetForRound() returns every pile (including exhaust) to the draw pile', () => {
    const deck = makeDeck(10);
    const [a, b] = deck.fillHand() as [Card, Card];
    deck.discard([a]);
    deck.exhaust([b]);
    deck.resetForRound();
    expect(deck.drawPile).toHaveLength(10);
    expect(deck.hand.length + deck.discardPile.length + deck.exhaustPile.length).toBe(0);
  });

  it('add() and remove() change the deck permanently', () => {
    const deck = makeDeck(5);
    const extra = { name: 'extra' };
    deck.add(extra);
    expect(deck.drawPile).toContain(extra);
    deck.fillHand();
    const victim = deck.hand[0] as Card;
    deck.remove(victim);
    deck.resetForRound();
    expect(deck.allCards).toHaveLength(5);
    expect(deck.allCards).not.toContain(victim);
    expect(() => deck.remove(victim)).toThrow(EngineError);
  });

  it('validates hand size', () => {
    const deck = makeDeck(5);
    deck.handSize = 7;
    expect(deck.handSize).toBe(7);
    expect(() => {
      deck.handSize = -1;
    }).toThrow(EngineError);
  });
});
