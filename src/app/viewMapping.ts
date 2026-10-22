import type { Payout } from '../engine/economy';
import type { PlayResult, RoundInfo, RoundPreview } from '../engine/run';
import type { ScoreContribution, ScoreFormula } from '../engine/scoring';
import type {
  NextRoundView,
  RoundSummaryView,
  RuleChangeView,
  ScoreContributionKind,
  ScoreContributionView,
  ScoreTallyView,
} from '../ui/types';
import type { ContentPresenter } from './ContentPresenter';

/**
 * Tally kind for one score log entry. The formula's first stat is the tally's "A" readout;
 * adding to any other stat reads as a multiplier bump, and `set` (e.g. an evaluator seeding a
 * stat) is shown as a note whose effect appears in the readouts.
 */
export function contributionKind(entry: ScoreContribution, statA: string | undefined): ScoreContributionKind {
  switch (entry.op) {
    case 'multiply':
      return 'xmult';
    case 'set':
      return 'note';
    case 'add':
      return entry.stat === statA ? 'add' : 'mult';
  }
}

/**
 * Replays a play's score log into tally steps. The first two formula stats become the A and B
 * readouts; each step's total is the formula applied to the stats as they stood after it.
 */
export function toScoreTally<TCard>(
  id: string,
  result: PlayResult,
  formula: ScoreFormula,
  presenter: ContentPresenter<TCard>,
): ScoreTallyView {
  const [statA, statB] = Object.keys(formula.initial);
  const running: Record<string, number> = { ...formula.initial };
  const contributions = result.score.log.map((entry, i): ScoreContributionView => {
    running[entry.stat] = entry.after;
    return {
      id: `${id}-${i}`,
      sourceLabel: presenter.sourceLabel(entry.source),
      kind: contributionKind(entry, statA),
      amount: entry.amount,
      runningA: statA === undefined ? undefined : running[statA],
      runningB: statB === undefined ? undefined : running[statB],
      total: formula.compute(running),
    };
  });
  return {
    id,
    contributions,
    finalTotal: result.total,
    labelA: statA === undefined ? undefined : presenter.statLabel(statA),
    labelB: statB === undefined ? undefined : presenter.statLabel(statB),
  };
}

export function toRoundSummary<TCard>(round: RoundInfo, payout: Payout, presenter: ContentPresenter<TCard>): RoundSummaryView {
  return {
    heading: `${round.isBoss ? 'Boss round' : 'Round'} ${round.number} cleared`,
    lines: payout.lines.map((line) => ({ label: presenter.payoutLabel(line.source), amount: line.amount })),
    total: payout.total(),
  };
}

/** The usual per-round rules a preview is compared against. */
export type RoundBaseline = {
  readonly plays: number;
  readonly discards: number;
  /** Hand size the engine planned the preview against. */
  readonly plannedHandSize: number;
  /** Hand size now; the boss's change applies relative to this at round start. */
  readonly currentHandSize: number;
};

export function toNextRound<TCard>(
  preview: RoundPreview<TCard>,
  baseline: RoundBaseline,
  presenter: ContentPresenter<TCard>,
): NextRoundView {
  const changes: RuleChangeView[] = [];
  const compare = (label: string, from: number, to: number): void => {
    if (from !== to) changes.push({ label, from, to });
  };
  compare('Plays', baseline.plays, preview.rules.plays);
  compare('Discards', baseline.discards, preview.rules.discards);
  const handDelta = preview.rules.handSize - baseline.plannedHandSize;
  compare('Hand size', baseline.currentHandSize, Math.max(0, baseline.currentHandSize + handDelta));
  return {
    round: preview.info.number,
    target: preview.info.target,
    boss: preview.boss === null ? undefined : presenter.presentBoss(preview.boss),
    ruleChanges: changes,
  };
}
