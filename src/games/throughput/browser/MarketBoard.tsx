import { CATEGORIES, formatAmount } from '../model';
import type { TrendStage } from '../model';
import type { ShiftResult, ThroughputRun } from '../rules';
import { CATEGORY_ACCENT, STAGE_NAME, demandViews } from './present';
import type { DemandView } from './present';
import './demand.css';

const ROWS: readonly TrendStage[] = ['hot', 'emerging', 'saturated', 'neutral'];

export type MarketBoardProps = {
  run: ThroughputRun;
  /** What running the current Line would do, to show the Demand it would use. */
  preview?: ShiftResult | null;
};

/** Trend board: this quarter and the next three, Demand per Category, and the Board Reviews ahead. */
export function MarketBoard({ run, preview = null }: MarketBoardProps) {
  const first = run.phase === 'shop' ? run.round + 1 : run.round;
  const quarters = Array.from({ length: 4 }, (_, i) => first + i).filter((r) => r <= run.rounds);
  const label = (round: number) => {
    const q = run.quarterOf(round);
    return `Y${q.year} ${q.isBoard ? 'Board' : `Q${q.quarter}`}`;
  };

  return (
    <section className="tp-market" aria-label="Market">
      <div className="tp-market__grid" style={{ gridTemplateColumns: `auto repeat(${quarters.length}, minmax(0, 1fr))` }}>
        <span className="tp-market__corner">Market</span>
        {quarters.map((round) => (
          <span key={round} className={`tp-market__quarter ${round === run.round && run.phase === 'shift' ? 'is-now' : ''}`}>
            {label(round)}
            {round === run.round && run.phase === 'shift' && <em> now</em>}
          </span>
        ))}
        {ROWS.map((stage) => (
          <MarketRow key={stage} run={run} stage={stage} quarters={quarters} />
        ))}
      </div>
      <DemandBars views={demandViews(run, preview)} inShop={run.phase !== 'shift'} premiumStep={run.config.grant.premiumStep} />
      <ul className="tp-market__boards">
        {run.upcomingBoards().map((b) => (
          <li key={b.round}>
            <strong>{label(b.round)}</strong> {b.boss.name}: {b.boss.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarketRow({ run, stage, quarters }: { run: ThroughputRun; stage: TrendStage; quarters: readonly number[] }) {
  return (
    <>
      <span className={`tp-market__stage tp-market__stage--${stage}`}>{STAGE_NAME[stage]}</span>
      {quarters.map((round) => {
        const trends = run.trends[round - 1];
        const holders = trends === undefined ? [] : CATEGORIES.filter((c) => trends[c] === stage);
        const pips = stage === 'hot' && round === run.round && run.phase === 'shift' ? run.hotPipsLeft : null;
        return (
          <span key={round} className="tp-market__cell">
            {holders.map((c) => (
              <span key={c} className="tp-chip" data-accent={CATEGORY_ACCENT[c]}>
                {c}
              </span>
            ))}
            {pips !== null && (
              <span className="tp-pips" aria-label={`${pips} buzz pips left`}>
                {Array.from({ length: run.hotPipsPerRound }, (_, i) => (
                  <span key={i} className={`tp-pip ${i < pips ? 'is-on' : ''}`} />
                ))}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}

/** Demand per Category as bars: what is left, what this Shift would use, and why it changes. */
function DemandBars({ views, inShop, premiumStep }: { views: readonly DemandView[]; inShop: boolean; premiumStep: number }) {
  return (
    <div className="tp-demand">
      <span className="tp-demand__label">{inShop ? 'Demand next round' : 'Demand left'}</span>
      <ul className="tp-demand__list">
        {views.map((v) => {
          const pct = (n: number) => (v.full > 0 ? Math.max(0, Math.min(100, (100 * n) / v.full)) : 0);
          const using = Math.min(v.using, v.left);
          const cues = [
            v.halved ? 'Saturated: halved' : '',
            v.bossCut ?? '',
            v.scale > 0 ? `Scale ${v.scale}` : '',
            v.premium > 0 ? `Premium ×${formatAmount(1 + premiumStep * v.premium)}` : '',
            v.earned > 0 ? `+${v.earned} from next round` : '',
            v.sellsOut ? `this Shift sells out: +${v.wouldEarn}` : v.wouldEarn > 0 ? `this Shift: +${v.wouldEarn}` : '',
          ].filter(Boolean);
          return (
            <li
              key={v.category}
              className="tp-demand__row"
              data-category={v.category}
              data-accent={CATEGORY_ACCENT[v.category]}
              data-halved={v.halved || undefined}
              data-sells-out={v.sellsOut || undefined}
            >
              <span className="tp-demand__name">{v.category}</span>
              <span
                className="tp-demand__bar"
                role="meter"
                aria-label={`${v.category} Demand`}
                aria-valuemin={0}
                aria-valuemax={v.full}
                aria-valuenow={v.left}
                aria-valuetext={`${v.left} of ${v.full} left${using > 0 ? `, this Shift uses ${using}` : ''}`}
              >
                <span className="tp-demand__fill" style={{ width: `${pct(v.left - using)}%` }} />
                {using > 0 && <span className="tp-demand__using" style={{ width: `${pct(using)}%` }} />}
              </span>
              <span className="tp-demand__count">
                {v.left}/{v.full}
              </span>
              {cues.length > 0 && <span className="tp-demand__cues">{cues.join(' · ')}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
