import { CATEGORIES } from '../model';
import type { TrendStage } from '../model';
import type { ThroughputRun } from '../rules';
import { CATEGORY_ACCENT, STAGE_NAME } from './present';

const ROWS: readonly TrendStage[] = ['hot', 'emerging', 'saturated', 'neutral'];

export type MarketBoardProps = { run: ThroughputRun };

/** Trend board: this quarter and the next three, Demand per Category, and the Board Reviews ahead. */
export function MarketBoard({ run }: MarketBoardProps) {
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
      <p className="tp-market__equity">
        <span className="tp-market__equity-label">Demand</span>
        {CATEGORIES.map((c) => (
          <span key={c} className="tp-chip" data-accent={CATEGORY_ACCENT[c]}>
            {c} {run.demandLeft[c]}/{run.demand[c]}
          </span>
        ))}
      </p>
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
                {Array.from({ length: run.config.hotPips }, (_, i) => (
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
