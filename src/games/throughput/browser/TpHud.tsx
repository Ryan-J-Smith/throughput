import { useTickingNumber } from '../../../ui/components';
import { prefersReducedMotion, speedScale } from '../../../ui/motion';
import { perksText } from '../cli';
import { bossArt } from './art';
import type { ThroughputRun } from '../rules';
import './art-slots.css';
import './hud-reveal.css';

/** Round Sales before and after a Shift whose total is landing, shown before the Run is applied. */
export type SalesReveal = { readonly from: number; readonly to: number };

export type TpHudProps = {
  run: ThroughputRun;
  /** Count Sales up from `from` to `to` (the bar fills with it and flashes at the target). */
  reveal?: SalesReveal | null;
};

/** How long Sales takes to count up at normal speed. */
const REVEAL_MS = 700;

/** The quarterly-report header: quarter, Sales against target, Shift, Retools, Capital, perks, and the Board rule. */
export function TpHud({ run, reveal = null }: TpHudProps) {
  const inShop = run.phase === 'shop';
  const round = inShop ? run.round + 1 : run.round;
  const quarter = run.quarterOf(round);
  const target = run.config.targets[round - 1] ?? 0;
  const revealing = reveal !== null && !inShop;
  const sales = inShop ? 0 : revealing ? reveal.to : run.sales;
  // Only a reveal counts; anything else (a new round, an applied Run) shows at once.
  const shown = useTickingNumber(sales, revealing && !prefersReducedMotion() ? REVEAL_MS * speedScale() : 0);
  const progress = target > 0 ? Math.min(1, shown / target) : 0;
  const boss = run.phase === 'shift' ? run.boss : null;

  return (
    <header className="hud tp-hud">
      <div className="hud__stat hud__stat--round" aria-label={`Round ${round} of ${run.rounds}`}>
        <span className={`hud__quarter ${quarter.isBoard ? 'tp-hud__board' : ''}`}>{quarter.isBoard ? 'Board' : `Q${quarter.quarter}`}</span>
        <span className="hud__year">Year {quarter.year}</span>
      </div>
      <div
        className="hud__stat hud__stat--score"
        data-reveal={revealing ? (shown < sales ? 'counting' : 'done') : undefined}
        data-hit={(revealing && target > 0 && shown >= target) || undefined}
      >
        <span className="hud__label">{inShop ? 'Next quarter' : 'Sales'}</span>
        <span className="hud__value">
          {inShop ? `$${target}` : `$${shown}`}
          <span className="hud__target">{inShop ? ' target' : ` of $${target} target`}</span>
        </span>
        <div
          className="hud__bar"
          role="progressbar"
          aria-label="Sales toward target"
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={Math.min(sales, target)}
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
        <div className="hud__boss" data-boss={boss.id}>
          {bossArt(boss.id) !== undefined && (
            <span className="hud__boss-art" aria-hidden="true">
              <img src={bossArt(boss.id)} alt="" loading="lazy" />
            </span>
          )}
          <span className="hud__boss-label">Board review</span>
          <span className="hud__boss-name">{boss.name}</span>
          <span className="hud__boss-desc">
            {boss.text}
            {run.shiftCap !== null && ` This round: at most $${run.shiftCap} a Shift.`}
          </span>
        </div>
      )}
    </header>
  );
}
