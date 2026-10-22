import type { Rng } from '../../../engine/rng';
import { CATEGORIES } from '../model';
import type { Category, TrendStage } from '../model';
import type { Trends } from './score-line';

const AFTER: Readonly<Record<TrendStage, TrendStage>> = { emerging: 'hot', hot: 'saturated', saturated: 'neutral', neutral: 'neutral' };

/** Quarter 1: a random Category in each of Emerging, Hot, Saturated and Neutral. */
export function initialTrends(rng: Rng): Trends {
  const [emerging, hot, saturated] = rng.shuffle(CATEGORIES);
  return build((c) => (c === emerging ? 'emerging' : c === hot ? 'hot' : c === saturated ? 'saturated' : 'neutral'));
}

/**
 * One quarter of the conveyor: Emerging → Hot → Saturated → Neutral, then a random Category that
 * was already Neutral (never the one just leaving Saturated) becomes Emerging.
 */
export function advanceTrends(trends: Trends, rng: Rng): Trends {
  const wasNeutral = CATEGORIES.filter((c) => trends[c] === 'neutral');
  const emerging = wasNeutral.length > 0 ? rng.pick(wasNeutral) : null;
  return build((c) => (c === emerging ? 'emerging' : AFTER[trends[c]]));
}

/** Trends for every round, fixed at the start of the run so the Market forecast is exact. */
export function trendSchedule(rounds: number, rng: Rng): Trends[] {
  const schedule: Trends[] = [initialTrends(rng.fork('trends-1'))];
  for (let round = 2; round <= rounds; round++) {
    schedule.push(advanceTrends(schedule[schedule.length - 1] as Trends, rng.fork(`trends-${round}`)));
  }
  return schedule;
}

function build(stageOf: (category: Category) => TrendStage): Trends {
  const out = {} as Record<Category, TrendStage>;
  for (const c of CATEGORIES) out[c] = stageOf(c);
  return out;
}
