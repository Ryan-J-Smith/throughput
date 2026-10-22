import { describe, expect, it } from 'vitest';
import { IDLE, dropKind, firstOpenBay, shiftKey } from '../browser';
import type { Mode } from '../browser';
import type { Stage } from '../model';
import { ThroughputRun } from '../rules';
import { easyConfig } from './fixtures';

/** The uid of the first hand card of `stage`. */
function uidOf(run: ThroughputRun, stage: Stage): number {
  const card = run.hand.find((c) => c.def.stage === stage);
  if (card === undefined) throw new Error(`no ${stage} card in hand`);
  return card.uid;
}

const handOf = (run: ThroughputRun, uid: number) => run.hand.findIndex((c) => c.uid === uid);

describe('THROUGHPUT quick loading', () => {
  it('the first open bay is the leftmost empty bay that can take the card', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    const make = uidOf(run, 'make');
    expect(firstOpenBay(run, make)).toBe(0);
    run.load([{ hand: handOf(run, uidOf(run, 'ship')), slot: 0 }]);
    expect(firstOpenBay(run, make)).toBe(1);
    expect(firstOpenBay(run, -1)).toBe(-1);
  });

  it('a drop loads an empty bay, swaps with a card loaded this Shift, and refuses a parked card', () => {
    const run = new ThroughputRun(1, easyConfig({ targets: [10_000] }));
    run.load([{ hand: handOf(run, uidOf(run, 'design')), slot: 0 }]);
    run.load([{ hand: handOf(run, uidOf(run, 'make')), slot: 1 }]);
    const ship = uidOf(run, 'ship');
    expect(dropKind(run, ship, 2)).toBe('load');
    expect(dropKind(run, ship, 1)).toBe('swap');
    run.runShift();
    // The Design stays on the Line, parked from Shift 1: dropping on it does nothing, as tapping it does.
    expect(run.line[0]?.card?.loadedShift).toBe(1);
    expect(dropKind(run, uidOf(run, 'ship'), 0)).toBeNull();
    expect(dropKind(run, -1, 2)).toBeNull();
  });
});

describe('THROUGHPUT Shift keys', () => {
  const run = () => new ThroughputRun(1, easyConfig({ targets: [10_000] }));

  it('a digit picks a hand card left to right, then a bay; Enter takes the first empty bay', () => {
    const r = run();
    const third = r.hand[2]?.uid as number;
    expect(shiftKey(r, IDLE, '3')).toEqual({ kind: 'mode', mode: { kind: 'place', uid: third } });
    expect(shiftKey(r, IDLE, '9')).toBeNull();
    const placing: Mode = { kind: 'place', uid: third };
    expect(shiftKey(r, placing, '2')).toEqual({ kind: 'load', uid: third, slot: 1 });
    expect(shiftKey(r, placing, '7')).toBeNull();
    expect(shiftKey(r, placing, 'Enter')).toEqual({ kind: 'load', uid: third, slot: 0 });
    expect(shiftKey(r, placing, 'Escape')).toEqual({ kind: 'mode', mode: IDLE });
    expect(shiftKey(r, IDLE, 'Escape')).toBeNull();
  });

  it('R enters and leaves Retool mode, where digits mark cards and Enter retools them', () => {
    const r = run();
    const [a, b, c] = r.hand.map((card) => card.uid);
    expect(shiftKey(r, IDLE, 'r')).toEqual({ kind: 'mode', mode: { kind: 'retool', uids: [] } });
    expect(shiftKey(r, { kind: 'retool', uids: [] }, 'R')).toEqual({ kind: 'mode', mode: IDLE });
    expect(shiftKey(r, { kind: 'retool', uids: [] }, '1')).toEqual({ kind: 'mode', mode: { kind: 'retool', uids: [a] } });
    expect(shiftKey(r, { kind: 'retool', uids: [a as number] }, '1')).toEqual({ kind: 'mode', mode: { kind: 'retool', uids: [] } });
    expect(shiftKey(r, { kind: 'retool', uids: [a, b, c] as number[] }, '4')).toEqual({ kind: 'notice', text: 'A Retool discards at most 3 cards' });
    expect(shiftKey(r, { kind: 'retool', uids: [] }, 'Enter')).toBeNull();
    expect(shiftKey(r, { kind: 'retool', uids: [a as number] }, 'Enter')).toEqual({ kind: 'retool' });
    r.retool([0]);
    r.retool([0]);
    expect(shiftKey(r, IDLE, 'r')).toEqual({ kind: 'notice', text: 'No Retools left this round' });
  });

  it('Space runs the Shift; other keys do nothing', () => {
    expect(shiftKey(run(), IDLE, ' ')).toEqual({ kind: 'run' });
    expect(shiftKey(run(), IDLE, 'x')).toBeNull();
    expect(shiftKey(run(), IDLE, '0')).toBeNull();
  });

  it('Enter with no empty bay that takes the card says so', () => {
    const r = run();
    r.load([0, 1, 2, 3, 4].map((i) => ({ hand: i, slot: i })));
    const uid = r.hand[0]?.uid as number;
    expect(shiftKey(r, { kind: 'place', uid }, 'Enter')).toMatchObject({ kind: 'notice', text: expect.stringMatching(/^No empty bay can take /) });
  });
});
