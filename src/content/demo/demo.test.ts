import { describe, expect, it } from 'vitest';
import { GameController } from '../../app';
import type { DemoCard } from '../../sim/demo';
import { DemoGame } from './DemoGame';

/** Greedy driver: best cards, buy whatever is affordable, never discard. Returns the highest round reached. */
function playThrough(c: GameController<DemoCard>, maxSteps = 2000): { end: string; maxRound: number } {
  let maxRound = 0;
  for (let step = 0; step < maxSteps; step++) {
    const view = c.getView();
    switch (view.screen) {
      case 'title':
        c.onStart();
        break;
      case 'round': {
        maxRound = Math.max(maxRound, view.hud.round);
        if (view.summary) c.onCashOut();
        else if (view.tally) c.onTallyComplete();
        else {
          const best = [...view.hand].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, view.maxSelected);
          for (const card of best) c.onToggleSelect(card.id);
          c.onPlay();
        }
        break;
      }
      case 'shop': {
        const offer = view.offers.find((o) => o.canBuy);
        if (offer) c.onBuy(offer.id);
        else c.onContinue();
        break;
      }
      case 'gameOver':
      case 'victory':
        return { end: view.screen, maxRound };
    }
  }
  throw new Error('run did not finish');
}

describe('DemoGame', () => {
  const game = new DemoGame();

  it('presents every starting card and every shop offer', () => {
    const config = game.createConfig();
    for (const card of config.startingDeck) expect(game.presenter.presentCard(card).title).toBe(`Card ${card.value}`);
    for (const pool of config.shop.pools) {
      for (const def of pool.registry.all()) expect(game.presenter.presentOffer(def).title).toBeTruthy();
    }
  });

  it('labels the tally readouts for its formula', () => {
    expect(game.presenter.statLabel('base')).toBe('Base');
    expect(game.presenter.statLabel('multiplier')).toBe('Mult');
  });

  it.each([1, 2, 3])('a greedy run (seed %i) clears round 1 and reaches an end screen through the controller', (seed) => {
    const result = playThrough(new GameController(game, () => seed));
    expect(['gameOver', 'victory']).toContain(result.end);
    expect(result.maxRound).toBeGreaterThanOrEqual(2);
  });
});
