import { describe, expect, it } from 'vitest';
import { Payout } from '../../engine/economy';
import { ProductFormula, ScoreContext } from '../../engine/scoring';
import { toNextRound, toRoundSummary, toScoreTally } from '../viewMapping';
import { TestPresenter, TightBoss } from './fakes';

const formula = new ProductFormula({ base: 0, multiplier: 1 });
const presenter = new TestPresenter();

function scoredPlay() {
  const score = new ScoreContext(formula);
  score.set('multiplier', 3, '3-card play');
  score.add('base', 5, 'card 5');
  score.add('multiplier', 2, 'Plus');
  score.multiply('multiplier', 1.5, 'Doubler');
  return { score, total: score.total() };
}

describe('toScoreTally', () => {
  const tally = toScoreTally('p', scoredPlay(), formula, presenter);

  it('maps ops to kinds: set → note, add on the first stat → add, add elsewhere → mult, multiply → xmult', () => {
    expect(tally.contributions.map((c) => c.kind)).toEqual(['note', 'add', 'mult', 'xmult']);
  });

  it('replays running stat values and formula totals per step', () => {
    expect(tally.contributions.map((c) => [c.runningA, c.runningB, c.total])).toEqual([
      [0, 3, 0],
      [5, 3, 15],
      [5, 5, 25],
      [5, 7.5, 37],
    ]);
    expect(tally.finalTotal).toBe(37);
  });

  it('labels stats and sources through the presenter', () => {
    expect(tally.labelA).toBe('Base');
    expect(tally.labelB).toBe('Multiplier');
    expect(tally.contributions.map((c) => c.sourceLabel)).toEqual(['3-card play', 'card 5', 'Plus', 'Doubler']);
  });

  it('gives each step a unique id under the tally id', () => {
    expect(new Set(tally.contributions.map((c) => c.id)).size).toBe(4);
    expect(tally.id).toBe('p');
  });
});

describe('toRoundSummary', () => {
  it('lists payout lines and the total, flagging boss rounds', () => {
    const payout = new Payout();
    payout.add('Round reward', 3);
    payout.add('Interest', 2);
    const summary = toRoundSummary({ number: 4, isBoss: true, target: 100 }, payout, presenter);
    expect(summary).toEqual({
      heading: 'Q4 closed: board memo met',
      lines: [
        { label: 'Round reward', amount: 3 },
        { label: 'Interest', amount: 2 },
      ],
      total: 5,
    });
  });
});

describe('toNextRound', () => {
  const baseline = { plays: 2, discards: 1, plannedHandSize: 4, currentHandSize: 4 };

  it('shows target, boss and only the rules that change', () => {
    const next = toNextRound(
      { info: { number: 2, isBoss: true, target: 20 }, rules: { target: 20, plays: 1, discards: 1, handSize: 3 }, boss: new TightBoss() },
      baseline,
      presenter,
    );
    expect(next).toEqual({
      round: 2,
      target: 20,
      boss: { name: 'Tight', description: 'One fewer play and card in hand' },
      ruleChanges: [
        { label: 'Plays', from: 2, to: 1 },
        { label: 'Hand size', from: 4, to: 3 },
      ],
    });
  });

  it('applies the hand size change relative to the current hand size', () => {
    const next = toNextRound(
      { info: { number: 2, isBoss: true, target: 20 }, rules: { target: 20, plays: 2, discards: 1, handSize: 3 }, boss: null },
      { ...baseline, currentHandSize: 6 },
      presenter,
    );
    expect(next.ruleChanges).toEqual([{ label: 'Hand size', from: 6, to: 5 }]);
    expect(next.boss).toBeUndefined();
  });
});
