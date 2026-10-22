import { Hand, Hud, ModifierRow } from '../components';
import type { CardView, HudView, ModifierRowView } from '../types';

export type RoundScreenProps = {
  hud: HudView;
  modifierRow: ModifierRowView;
  hand: readonly CardView[];
  selectedIds: readonly string[];
  maxSelected: number;
  canPlay: boolean;
  canDiscard: boolean;
  onToggleSelect: (cardId: string) => void;
  onPlay: () => void;
  onDiscard: () => void;
};

export function RoundScreen({ hud, modifierRow, hand, ...handProps }: RoundScreenProps) {
  return (
    <main className="screen screen--round">
      <Hud hud={hud} />
      <ModifierRow row={modifierRow} />
      <Hand cards={hand} {...handProps} />
    </main>
  );
}
