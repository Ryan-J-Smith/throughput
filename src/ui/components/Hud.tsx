import { useEffect, useState } from 'react';
import { quarterOf } from '../format';
import { durationToken, prefersReducedMotion } from '../motion';
import type { HudView } from '../types';
import { useTickingNumber } from './useTickingNumber';

/**
 * Cash the last HUD showed. Each screen mounts its own HUD, so the shop's HUD counts on from the
 * round screen's figure after cash out (the shop still reports the round just cleared).
 */
let lastCash: { round: number; cash: number } | null = null;

export type HudProps = {
  hud: HudView;
};

/** The round's numbers laid out like the header of a quarterly report. */
export function Hud({ hud }: HudProps) {
  const progress = hud.targetScore > 0 ? Math.min(1, hud.currentScore / hud.targetScore) : 0;
  const { quarter, year } = quarterOf(hud.round);
  const [tickMs] = useState(() => (prefersReducedMotion() ? 0 : durationToken('--dur-slow', 480) * 1.5));
  const revenue = useTickingNumber(hud.currentScore, tickMs);
  const cash = useTickingNumber(hud.cash, tickMs, lastCash?.round === hud.round ? lastCash.cash : hud.cash);
  useEffect(() => {
    lastCash = { round: hud.round, cash };
  }, [hud.round, cash]);

  return (
    <header className="hud">
      <div className="hud__stat hud__stat--round" aria-label={`Round ${hud.round}`}>
        <span className="hud__quarter">{quarter}</span>
        <span className="hud__year">{year}</span>
      </div>
      <div className="hud__stat hud__stat--score">
        <span className="hud__label">Revenue</span>
        <span className="hud__value">
          {revenue}
          <span className="hud__target"> of {hud.targetScore} target</span>
        </span>
        <div
          className="hud__bar"
          role="progressbar"
          aria-label="Revenue toward target"
          aria-valuemin={0}
          aria-valuemax={hud.targetScore}
          aria-valuenow={hud.currentScore}
        >
          <div className="hud__bar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <div className="hud__stat hud__stat--plays">
        <span className="hud__label">Plays left</span>
        <span className="hud__value">{hud.playsLeft}</span>
      </div>
      <div className="hud__stat hud__stat--discards">
        <span className="hud__label">Discards left</span>
        <span className="hud__value">{hud.discardsLeft}</span>
      </div>
      <div className="hud__stat hud__stat--cash">
        <span className="hud__label">Cash</span>
        <span className="hud__value">${cash}</span>
      </div>
      {hud.boss && (
        <div className="hud__boss">
          <span className="hud__boss-label">Board memo</span>
          <span className="hud__boss-name">{hud.boss.name}</span>
          <span className="hud__boss-desc">{hud.boss.description}</span>
        </div>
      )}
    </header>
  );
}
