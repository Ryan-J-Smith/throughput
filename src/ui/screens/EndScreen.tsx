import type { HudView } from '../types';

export type EndScreenProps = {
  outcome: 'gameOver' | 'victory';
  hud: HudView;
  onRestart: () => void;
};

export function EndScreen({ outcome, hud, onRestart }: EndScreenProps) {
  const won = outcome === 'victory';
  return (
    <main className={`screen screen--end ${won ? 'screen--victory' : 'screen--game-over'}`}>
      <h1 className="end-title">{won ? 'Victory' : 'Game Over'}</h1>
      <dl className="end-stats">
        <dt>Round</dt>
        <dd>{hud.round}</dd>
        <dt>Score</dt>
        <dd>
          {hud.currentScore} / {hud.targetScore}
        </dd>
        <dt>Cash</dt>
        <dd>${hud.cash}</dd>
      </dl>
      <button type="button" className="btn btn--play btn--large" onClick={onRestart}>
        New run
      </button>
    </main>
  );
}
