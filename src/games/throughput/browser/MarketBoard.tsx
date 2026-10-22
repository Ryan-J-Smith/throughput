import { Icon } from '../../../ui/icons';
import { CATEGORIES } from '../model';
import type { TrendStage } from '../model';
import type { ShiftResult, ThroughputRun } from '../rules';
import { CATEGORY_ICON, bossArt } from './art';
import { CATEGORY_ACCENT, STAGE_NAME, demandViews } from './present';
import type { DemandView } from './present';
import './demand.css';
import './art-slots.css';

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
        {quarters.map((round, col) => (
          <span key={round} className={`tp-market__quarter ${round === run.round && run.phase === 'shift' ? 'is-now' : ''}`} data-col={col}>
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
          <li key={b.round} data-boss={b.boss.id}>
            {bossArt(b.boss.id) !== undefined && <img className="tp-market__board-art" src={bossArt(b.boss.id)} alt="" loading="lazy" />}
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
      {quarters.map((round, col) => {
        const trends = run.trends[round - 1];
        const holders = trends === undefined ? [] : CATEGORIES.filter((c) => trends[c] === stage);
        const pips = stage === 'hot' && round === run.round && run.phase === 'shift' ? run.hotPipsLeft : null;
        return (
          <span key={round} className="tp-market__cell" data-col={col}>
            {holders.map((c) => (
              <span key={c} className="tp-chip" data-accent={CATEGORY_ACCENT[c]} data-category={c} title={c}>
                <Icon name={CATEGORY_ICON[c]} className="tp-chip__icon" />
                <span className="tp-chip__name">{c}</span>
              </span>
            ))}
            {pips !== null && (
              <span className="tp-pips" role="img" aria-label={pipsText(pips, holders)} title={pipsText(pips, holders)}>
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

/** The Hot buzz pips in words, e.g. "2 Hot boosts left this round: each Shift that sells Gadgets sells it at ×2 and uses one". */
function pipsText(pips: number, hot: readonly string[]): string {
  const left = `${pips} Hot boost${pips === 1 ? '' : 's'} left this round`;
  return pips === 0 || hot.length === 0 ? left : `${left}: each Shift that sells ${hot.join(' or ')} sells it at ×2 and uses one`;
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
            v.premium > 0 ? `sells +${Math.round(100 * premiumStep * v.premium)}% (Premium)` : '',
            v.earned > 0 ? `Demand grows +${v.earned} next round` : '',
            v.sellsOut
              ? `this Shift sells it out${v.wouldEarn > 0 ? `, growing Demand +${v.wouldEarn} next round` : ''}`
              : v.wouldEarn > 0
                ? `this Shift grows Demand +${v.wouldEarn} next round`
                : '',
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
              {cues.length > 0 && (
                <span className="tp-demand__cues" title="Selling a Category out, or selling an Emerging one, grows its Demand for good from next round.">
                  {cues.join(' · ')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
