import { perksText } from '../cli';
import type { ThroughputRun } from '../rules';

export type TpHudProps = { run: ThroughputRun };

/** The quarterly-report header: quarter, Sales against target, Shift, Retools, Capital, perks, and the Board rule. */
export function TpHud({ run }: TpHudProps) {
  const inShop = run.phase === 'shop';
  const round = inShop ? run.round + 1 : run.round;
  const quarter = run.quarterOf(round);
  const target = run.config.targets[round - 1] ?? 0;
  const sales = inShop ? 0 : run.sales;
  const progress = target > 0 ? Math.min(1, sales / target) : 0;
  const boss = run.phase === 'shift' ? run.boss : null;

  return (
    <header className="hud tp-hud">
      <div className="hud__stat hud__stat--round" aria-label={`Round ${round} of ${run.rounds}`}>
        <span className={`hud__quarter ${quarter.isBoard ? 'tp-hud__board' : ''}`}>{quarter.isBoard ? 'Board' : `Q${quarter.quarter}`}</span>
        <span className="hud__year">Year {quarter.year}</span>
      </div>
      <div className="hud__stat hud__stat--score">
        <span className="hud__label">{inShop ? 'Next quarter' : 'Sales'}</span>
        <span className="hud__value">
          {inShop ? `$${target}` : `$${sales}`}
          <span className="hud__target">{inShop ? ' target' : ` of $${target} target`}</span>
        </span>
        <div
          className="hud__bar"
          role="progressbar"
          aria-label="Sales toward target"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={sales}
        >
          <div className="hud__bar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <div className="hud__stat">
        <span className="hud__label">{inShop ? 'Deck' : 'Shift'}</span>
        <span className="hud__value">{inShop ? run.deck.length : `${run.shift} of ${run.shiftsThisRound}`}</span>
      </div>
      <div className="hud__stat">
        <span className="hud__label">{inShop ? 'Slots' : 'Retools'}</span>
        <span className="hud__value">{inShop ? run.line.length : run.retoolsLeft}</span>
      </div>
      <div className="hud__stat hud__stat--cash">
        <span className="hud__label">Capital</span>
        <span className="hud__value">{run.wallet.cash}C</span>
      </div>
      {perksText(run) !== '' && <p className="tp-hud__perks">{perksText(run)}</p>}
      {boss !== null && (
        <div className="hud__boss">
          <span className="hud__boss-label">Board review</span>
          <span className="hud__boss-name">{boss.name}</span>
          <span className="hud__boss-desc">{boss.text}</span>
        </div>
      )}
    </header>
  );
}
