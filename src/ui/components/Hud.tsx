import type { HudView } from '../types';
import { quarterOf } from './quarter';

export type HudProps = {
  hud: HudView;
};

/** The round's numbers laid out like the header of a quarterly report. */
export function Hud({ hud }: HudProps) {
  const progress = hud.targetScore > 0 ? Math.min(1, hud.currentScore / hud.targetScore) : 0;
  const { quarter, year } = quarterOf(hud.round);

  return (
    <header className="hud">
      <div className="hud__stat hud__stat--round" aria-label={`Round ${hud.round}`}>
        <span className="hud__quarter">{quarter}</span>
        <span className="hud__year">{year}</span>
      </div>
      <div className="hud__stat hud__stat--score">
        <span className="hud__label">Revenue</span>
        <span className="hud__value">
          {hud.currentScore}
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
        <span className="hud__value">${hud.cash}</span>
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
