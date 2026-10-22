import type { BomRun } from '../rules';
import { MARKET_NAME } from './present';

export type BomHudProps = {
  run: BomRun;
  /** Interest the next clear would pay on the cash held now. */
  interestNext: number;
};

/** Quarter and market, revenue against target, Builds, Scraps, cash, and the Boss disruption memo. */
export function BomHud({ run, interestNext }: BomHudProps) {
  const inShop = run.phase === 'shop';
  const round = inShop ? (run.nextRound ?? run.round) : run.round;
  const revenue = inShop ? 0 : run.revenue;
  const progress = round.target > 0 ? Math.min(1, revenue / round.target) : 0;
  // During the Small and Big rounds the quarter's Boss disruption is already known once revealed.
  const bossDisruption = round.market === 'boss' ? round.disruption : run.revealedDisruption(round.quarter);
  const memo = inShop ? null : bossDisruption;

  return (
    <header className="hud bom-hud">
      <div className="hud__stat hud__stat--round" aria-label={`Round ${round.index + 1} of ${run.totalRounds}`}>
        <span className="hud__quarter">Q{round.quarter}</span>
        <span className="hud__year">{MARKET_NAME[round.market]} market</span>
      </div>
      <div className="hud__stat hud__stat--score">
        <span className="hud__label">{inShop ? 'Next round' : run.phase === 'overtime' ? 'Revenue: target reached' : 'Revenue'}</span>
        <span className="hud__value">
          {inShop ? `$${round.target}` : `$${revenue}`}
          <span className="hud__target">{inShop ? ' target' : ` of $${round.target} target`}</span>
        </span>
        <div className="hud__bar" role="progressbar" aria-label="Revenue toward target" aria-valuemin={0} aria-valuemax={round.target} aria-valuenow={revenue}>
          <div className="hud__bar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      {!inShop && (
        <>
          <div className="hud__stat">
            <span className="hud__label">Builds</span>
            <span className="hud__value">{run.buildsLeft}</span>
          </div>
          <div className="hud__stat">
            <span className="hud__label">Scraps</span>
            <span className="hud__value">{run.scrapsLeft}</span>
          </div>
        </>
      )}
      <div className="hud__stat hud__stat--cash">
        <span className="hud__label">Cash</span>
        <span className="hud__value">${run.wallet.cash}</span>
        {interestNext > 0 && <span className="bom-hud__interest">+${interestNext} interest on clear</span>}
      </div>
      {memo !== null && (
        <div className="hud__boss">
          <span className="hud__boss-label">{round.market === 'boss' ? 'Market disruption, this round' : `Q${round.quarter} Boss disruption`}</span>
          <span className="hud__boss-name">{memo.name}</span>
          <span className="hud__boss-desc">{memo.text}</span>
        </div>
      )}
    </header>
  );
}
