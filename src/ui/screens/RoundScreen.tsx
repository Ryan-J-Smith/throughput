import { Hand, Hud, ModifierRow, RoundSummary, ScoreTally } from '../components';
import type { CardView, HudView, ModifierRowView, RoundSummaryView, ScoreTallyView, TallySpeed } from '../types';

export type RoundScreenProps = {
  hud: HudView;
  modifierRow: ModifierRowView;
  hand: readonly CardView[];
  selectedIds: readonly string[];
  maxSelected: number;
  canPlay: boolean;
  canDiscard: boolean;
  handLocked: boolean;
  tally?: ScoreTallyView;
  summary?: RoundSummaryView;
  tallySpeed: TallySpeed;
  onTallySpeedChange: (speed: TallySpeed) => void;
  onTallyComplete: () => void;
  onCashOut: () => void;
  onToggleSelect: (cardId: string) => void;
  onPlay: () => void;
  onDiscard: () => void;
};

export function RoundScreen({
  hud,
  modifierRow,
  hand,
  handLocked,
  tally,
  summary,
  tallySpeed,
  onTallySpeedChange,
  onTallyComplete,
  onCashOut,
  ...handProps
}: RoundScreenProps) {
  return (
    <main className="screen screen--round">
      <Hud hud={hud} />
      <ModifierRow row={modifierRow} />
      <div className="play-area">
        {summary ? (
          <RoundSummary summary={summary} onCashOut={onCashOut} />
        ) : tally ? (
          <ScoreTally
            key={tally.id}
            tally={tally}
            speed={tallySpeed}
            onSpeedChange={onTallySpeedChange}
            onComplete={onTallyComplete}
          />
        ) : (
          <p className="play-area__hint">Select up to {handProps.maxSelected} cards, then Play.</p>
        )}
      </div>
      <Hand cards={hand} locked={handLocked} {...handProps} />
    </main>
  );
}
