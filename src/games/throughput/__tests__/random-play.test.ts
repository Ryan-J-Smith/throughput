import { describe, expect, it } from 'vitest';
import { Rng } from '../../../engine/rng';
import { DEFAULT_CONFIG } from '../content';
import { ThroughputRun } from '../rules';

/** Cards in play this round: everything owned is in exactly one of draw, hand, discard or the Line. */
function cardsAccountedFor(run: ThroughputRun): boolean {
  const onLine = run.line.filter((s) => s.card !== null).length;
  return run.drawPile.length + run.hand.length + run.discardPile.length + onLine === run.deck.length;
}

/** One random legal action; returns false once the run is over. */
function randomStep(run: ThroughputRun, rng: Rng): boolean {
  if (run.phase === 'won' || run.phase === 'lost') return false;
  if (run.phase === 'shift') {
    const roll = rng.next();
    const open = run.line.map((_, i) => i).filter((i) => run.whyCannotLoad([{ hand: 0, slot: i }]) === null);
    if (roll < 0.6 && run.hand.length > 0 && open.length > 0) run.load([{ hand: rng.int(0, run.hand.length - 1), slot: rng.pick(open) }]);
    else if (roll < 0.65 && run.whyCannotRetool([0]) === null) run.retool([0]);
    else if (roll < 0.7) {
      const parked = run.line.map((_, i) => i).filter((i) => run.whyCannotScrap([i]) === null);
      if (parked.length > 0) run.scrap([rng.pick(parked)]);
    } else run.runShift();
    return true;
  }
  const roll = rng.next();
  const offer = rng.int(0, 4);
  const target = { slot: rng.int(0, run.line.length - 1), deckCard: rng.int(0, run.deck.length - 1) };
  if (roll < 0.5 && run.whyCannotBuy(offer, target) === null) run.buy(offer, target);
  else if (roll < 0.6 && run.whyCannotReroll() === null) run.reroll();
  else if (roll < 0.65 && run.whyCannotMove(0, 1) === null) run.moveFixture(0, 1);
  else if (roll < 0.7 && run.whyCannotSellFixture(0) === null) run.sellFixture(0);
  else run.continueToNextRound();
  return true;
}

describe('random legal play', () => {
  it('never throws, never loses a card, and always ends', () => {
    const config = { ...DEFAULT_CONFIG, targets: DEFAULT_CONFIG.targets.map((t) => Math.ceil(t / 20)) };
    for (let seed = 1; seed <= 40; seed++) {
      const run = new ThroughputRun(seed, config);
      const rng = new Rng(seed).fork('test');
      let steps = 0;
      while (randomStep(run, rng)) {
        if (run.phase === 'shift') expect(cardsAccountedFor(run)).toBe(true);
        expect(run.wallet.cash).toBeGreaterThanOrEqual(0);
        expect(++steps).toBeLessThan(2000);
      }
      expect(['won', 'lost']).toContain(run.phase);
    }
  });
});
