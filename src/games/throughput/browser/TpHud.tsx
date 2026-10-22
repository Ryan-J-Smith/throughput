import { useTickingNumber } from '../../../ui/components';
import { prefersReducedMotion, speedScale } from '../../../ui/motion';
import { perksText } from '../cli';
import { bossArt } from './art';
import type { ThroughputRun } from '../rules';
import './art-slots.css';
import './hud-reveal.css';
import './hud-pending.css';

/** One sale banked during a reveal: its "+$" flashes beside Sales, bigger for a big one. */
export type RevealSale = { readonly key: number; readonly amount: number; readonly big: boolean };

/**
 * Round Sales before and after a Shift (or a sale of one) lands, shown before the Run is applied.
 * `ms` is how long the count takes, already scaled to the speed setting (default: a full reveal).
 */
export type SalesReveal = { readonly from: number; readonly to: number; readonly ms?: number; readonly sale?: RevealSale };

export type TpHudProps = {
  run: ThroughputRun;
  /** Count Sales up from `from` to `to` (the bar fills with it and flashes at the target). */
  reveal?: SalesReveal | null;
  /**
   * What running the loaded Line now would add to Sales (the preview's total), shown apart from the
   * banked Sales; during a reveal, what the Shift has still to bank (the bar's ghost only).
   */
  pending?: number | null;
};

/** How long Sales takes to count up at normal speed. */
const REVEAL_MS = 700;

/** The quarterly-report header: quarter, Sales against target, Shift, Retools, Capital, perks, and the Board rule. */
export function TpHud({ run, reveal = null, pending = null }: TpHudProps) {
  const inShop = run.phase === 'shop';
  const round = inShop ? run.round + 1 : run.round;
  const quarter = run.quarterOf(round);
  const target = run.config.targets[round - 1] ?? 0;
  const revealing = reveal !== null && !inShop;
  const sales = inShop ? 0 : revealing ? reveal.to : run.sales;
  // Only a reveal counts; anything else (a new round, an applied Run) shows at once.
  const shown = useTickingNumber(sales, revealing && !prefersReducedMotion() ? (reveal.ms ?? REVEAL_MS * speedScale()) : 0);
  const progress = target > 0 ? Math.min(1, shown / target) : 0;
  const pendingNow = inShop || pending === null || pending === 0 ? null : pending;
  // The ghost runs from the fill to what the Shift will have made; during a reveal that includes a sale still counting up.
  const ghostTo = sales + (pendingNow !== null && pendingNow > 0 ? pendingNow : 0);
  const ghost = target > 0 && (revealing || ghostTo > sales) ? Math.max(0, Math.min(1, ghostTo / target) - progress) : 0;
  const sale = revealing ? reveal.sale : undefined;
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
          {sale !== undefined && (
            <span key={sale.key} className="tp-hud__sale" data-big={sale.big || undefined}>
              +${sale.amount}
            </span>
          )}
          {pendingNow !== null && !revealing && (
            <span className="tp-hud__pending" data-sign={pendingNow > 0 ? 'up' : 'down'} title="Not banked yet: what this Shift adds to Sales if you run it now">
              {pendingNow > 0 ? '+' : '−'}${Math.abs(pendingNow)} if you run
            </span>
          )}
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
          {ghost > 0 && <div className="tp-hud__bar-pending" style={{ left: `${progress * 100}%`, width: `${ghost * 100}%` }} />}
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
      <div className="hud__stat hud__stat--cash" title="Capital (C) is what you spend in the shop between rounds. Only Sales ($) count toward the target.">
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
