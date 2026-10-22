import { Hand, Hud, ModifierRow, RoundSummary, ScoreTally } from '../components';
import type {
  CardView,
  HandSort,
  HudView,
  ModifierRowView,
  RoundSummaryView,
  ScoreTallyView,
  TallySpeed,
} from '../types';

export type RoundScreenProps = {
  hud: HudView;
  modifierRow: ModifierRowView;
  hand: readonly CardView[];
  handSort: HandSort;
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
  onSortHand: (sort: HandSort) => void;
  onSellModifier: (modifierId: string) => void;
  onMoveModifier: (modifierId: string, toIndex: number) => void;
  onToggleSelect: (cardId: string) => void;
  onPlay: () => void;
  onDiscard: () => void;
};

export function RoundScreen({
  hud,
  modifierRow,
  hand,
  handSort,
  handLocked,
  tally,
  summary,
  tallySpeed,
  onTallySpeedChange,
  onTallyComplete,
  onCashOut,
  onSortHand,
  onSellModifier,
  onMoveModifier,
  ...handProps
}: RoundScreenProps) {
  return (
    <main className="screen screen--round">
      <Hud hud={hud} />
      <ModifierRow row={modifierRow} onSell={onSellModifier} onMove={onMoveModifier} />
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
      <Hand cards={hand} locked={handLocked} sort={handSort} onSortChange={onSortHand} {...handProps} />
    </main>
  );
}
