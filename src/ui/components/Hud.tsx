import type { HudView } from '../types';

export type HudProps = {
  hud: HudView;
};

export function Hud({ hud }: HudProps) {
  const progress = hud.targetScore > 0 ? Math.min(1, hud.currentScore / hud.targetScore) : 0;

  return (
    <header className="hud">
      <div className="hud__stat hud__stat--round">
        <span className="hud__label">Round</span>
        <span className="hud__value">{hud.round}</span>
      </div>
      <div className="hud__stat hud__stat--score">
        <span className="hud__label">Score</span>
        <span className="hud__value">
          {hud.currentScore}
          <span className="hud__target"> / {hud.targetScore}</span>
        </span>
        <div
          className="hud__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={hud.targetScore}
          aria-valuenow={hud.currentScore}
        >
          <div className="hud__bar-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <div className="hud__stat hud__stat--plays">
        <span className="hud__label">Plays</span>
        <span className="hud__value">{hud.playsLeft}</span>
      </div>
      <div className="hud__stat hud__stat--discards">
        <span className="hud__label">Discards</span>
        <span className="hud__value">{hud.discardsLeft}</span>
      </div>
      <div className="hud__stat hud__stat--cash">
        <span className="hud__label">Cash</span>
        <span className="hud__value">${hud.cash}</span>
      </div>
    </header>
  );
}
