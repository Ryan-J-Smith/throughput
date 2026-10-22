import type { ItemImpact } from '../impact';
import { fixed, pct, signedPct, table, toCsv } from './text';

const signed = (x: number | null, digits: number): string => (x === null ? '-' : `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`);

/**
 * One row per shop item in the given order (computeImpact sorts by aware Δ). "aware Δ" compares
 * buyers with skippers offered it at the same shop round, so late-game items are not credited for
 * the strength of the runs that reach them; "naive Δ" is the plain whole-run comparison.
 */
export function formatImpact(items: readonly ItemImpact[]): string {
  const rows = items.map((i) => [
    i.id,
    i.kind,
    String(i.offers),
    pct(i.pickRate),
    String(i.runsBought),
    pct(i.winRateBought),
    String(i.runsSkipped),
    pct(i.winRateSkipped),
    signedPct(i.naiveWinDelta),
    signedPct(i.awareWinDelta),
    signed(i.awareSurvivalDelta, 2),
    fixed(i.awareWeight, 1),
    fixed(i.meanPurchaseRound, 1),
    fixed(i.meanRoundsAfterPurchase, 1),
    i.lowSample ? 'LOW N' : '',
  ]);
  const header = ['item', 'kind', 'offers', 'pick%', 'bought', 'win%', 'skipped', 'win%', 'naive Δ', 'aware Δ', 'aware Δrnd', 'w', 'buy@', 'after', 'flag'];
  return [
    'item impact (sorted by aware Δ win rate: buyers vs skippers at the same shop round)',
    table(header, rows),
    'bought/skipped = runs that bought it / were offered it and never bought it; aware Δrnd = extra rounds cleared;',
    'w = effective sample of the aware comparison; buy@ = mean round of first purchase; after = rounds cleared after it.',
  ].join('\n');
}

export function impactCsv(items: readonly ItemImpact[]): string {
  const header = [
    'id', 'kind', 'offers', 'purchases', 'pick_rate', 'runs_offered', 'runs_bought', 'runs_skipped',
    'win_rate_bought', 'win_rate_skipped', 'naive_win_delta', 'aware_win_delta', 'aware_survival_delta',
    'aware_weight', 'mean_purchase_round', 'mean_rounds_after_purchase', 'low_sample',
  ];
  const rows = items.map((i) => [
    i.id, i.kind, i.offers, i.purchases, i.pickRate, i.runsOffered, i.runsBought, i.runsSkipped,
    i.winRateBought, i.winRateSkipped, i.naiveWinDelta, i.awareWinDelta, i.awareSurvivalDelta,
    i.awareWeight, i.meanPurchaseRound, i.meanRoundsAfterPurchase, i.lowSample,
  ]);
  return toCsv(header, rows);
}
