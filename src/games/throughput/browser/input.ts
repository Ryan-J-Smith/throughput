import { cardName } from '../model';
import type { ThroughputRun } from '../rules';

/** What a tap means right now. Cards are tracked by uid because hand positions shift. */
export type Mode =
  | { readonly kind: 'idle' }
  | { readonly kind: 'place'; readonly uid: number }
  | { readonly kind: 'retool'; readonly uids: readonly number[] }
  | { readonly kind: 'install'; readonly offer: number }
  | { readonly kind: 'contract'; readonly offer: number }
  | { readonly kind: 'grant'; readonly offer: number }
  | { readonly kind: 'fixture'; readonly slot: number };

export const IDLE: Mode = { kind: 'idle' };

/** What a key press (or another shortcut) asks the Shift screen to do. */
export type ShiftIntent =
  | { readonly kind: 'mode'; readonly mode: Mode }
  | { readonly kind: 'load'; readonly uid: number; readonly slot: number }
  | { readonly kind: 'retool' }
  | { readonly kind: 'run' }
  | { readonly kind: 'notice'; readonly text: string };

/** The leftmost empty bay that can take the hand card `uid` now, or -1 if none can. */
export function firstOpenBay(run: ThroughputRun, uid: number): number {
  const hand = run.hand.findIndex((c) => c.uid === uid);
  if (hand < 0) return -1;
  return run.line.findIndex((slot, i) => slot.card === null && run.whyCannotLoad([{ hand, slot: i }]) === null);
}

/**
 * What dropping the hand card `uid` on bay `slot` would do: load it there, swap it for the card
 * loaded there (which goes back to the hand, as a tap would send it), or nothing (null).
 */
export function dropKind(run: ThroughputRun, uid: number, slot: number): 'load' | 'swap' | null {
  const hand = run.hand.findIndex((c) => c.uid === uid);
  if (hand < 0) return null;
  if (run.whyCannotLoad([{ hand, slot }]) === null) return 'load';
  const held = run.line[slot]?.card;
  return held != null && run.whyCannotUnload([slot]) === null ? 'swap' : null;
}

/** The leftmost-empty-bay load for `uid`, or a notice saying why there is none. */
function loadFirstOpen(run: ThroughputRun, uid: number): ShiftIntent {
  const slot = firstOpenBay(run, uid);
  if (slot >= 0) return { kind: 'load', uid, slot };
  const card = run.hand.find((c) => c.uid === uid);
  return { kind: 'notice', text: `No empty bay can take ${card === undefined ? 'that card' : cardName(card)}` };
}

/**
 * The Shift screen's keys: 1–9 picks a hand card (left to right), then 1–9 a bay, or Enter the
 * leftmost empty one; in Retool mode 1–9 marks cards and Enter retools them. R toggles Retool
 * mode, Space runs the Shift, Esc puts down what is picked. Null for a key that does nothing now.
 */
export function shiftKey(run: ThroughputRun, mode: Mode, key: string): ShiftIntent | null {
  const digit = /^[1-9]$/.test(key) ? Number(key) - 1 : null;
  switch (mode.kind) {
    case 'place':
      if (digit !== null) return digit < run.line.length ? { kind: 'load', uid: mode.uid, slot: digit } : null;
      if (key === 'Enter') return loadFirstOpen(run, mode.uid);
      break;
    case 'retool': {
      const card = digit === null ? undefined : run.hand[digit];
      if (card !== undefined) {
        const marked = mode.uids.includes(card.uid) ? mode.uids.filter((u) => u !== card.uid) : [...mode.uids, card.uid];
        if (marked.length > run.config.retoolMax) return { kind: 'notice', text: `A Retool discards at most ${run.config.retoolMax} cards` };
        return { kind: 'mode', mode: { kind: 'retool', uids: marked } };
      }
      if (key === 'Enter') return mode.uids.length > 0 ? { kind: 'retool' } : null;
      break;
    }
    default: {
      const card = digit === null ? undefined : run.hand[digit];
      if (card !== undefined) return { kind: 'mode', mode: { kind: 'place', uid: card.uid } };
    }
  }
  if (key === 'r' || key === 'R') {
    if (mode.kind === 'retool') return { kind: 'mode', mode: IDLE };
    const reason = run.whyCannotRetool([0]);
    return reason === null ? { kind: 'mode', mode: { kind: 'retool', uids: [] } } : { kind: 'notice', text: reason };
  }
  if (key === ' ') return { kind: 'run' };
  if (key === 'Escape') return mode.kind === 'idle' ? null : { kind: 'mode', mode: IDLE };
  return null;
}

/** The keys in a line, for How to play and the Run button's tooltip. */
export const KEYS_HINT = '1–7 picks a hand card, then 1–7 a bay (Enter: the first empty one). R Retool, Space Run, Esc cancel.';
