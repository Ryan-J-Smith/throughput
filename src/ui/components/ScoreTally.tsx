import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ScoreTallyView, TallySpeed } from '../types';
import { formatContribution, formatNumber, NEXT_SPEED, TALLY_TIMING, tallyFrame } from './tally';

export type ScoreTallyProps = {
  tally: ScoreTallyView;
  speed: TallySpeed;
  /** Fires once, after the final total has been shown. */
  onComplete: () => void;
  /** When provided, renders a speed toggle. */
  onSpeedChange?: (speed: TallySpeed) => void;
};

type Phase = 'running' | 'slam' | 'done';

/** Animate `value` toward its latest target; integers tick as integers. */
function useTickingNumber(target: number, durationMs: number): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);

  useEffect(() => {
    const from = current.current;
    if (from === target || durationMs <= 0) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const integral = Number.isInteger(target) && Number.isInteger(from);
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const raw = from + (target - from) * eased;
      const value = t === 1 ? target : integral ? Math.round(raw) : Math.round(raw * 10) / 10;
      current.current = value;
      setShown(value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return shown;
}

/**
 * Balatro-style score breakdown. Reveals contributions one at a time, then slams the final total.
 * Click (or Enter/Space) skips to the total; a second click finishes immediately.
 * Mount with `key={tally.id}` so each play restarts the animation.
 */
export function ScoreTally({ tally, speed, onComplete, onSpeedChange }: ScoreTallyProps) {
  const [revealed, setRevealed] = useState(0);
  const [phase, setPhase] = useState<Phase>('running');
  const completed = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const { stepMs, holdMs } = TALLY_TIMING[speed];
  const count = tally.contributions.length;

  useEffect(() => {
    if (phase === 'running') {
      const id = setTimeout(() => {
        if (revealed < count) setRevealed(revealed + 1);
        else setPhase('slam');
      }, stepMs);
      return () => clearTimeout(id);
    }
    if (phase === 'slam') {
      const id = setTimeout(() => setPhase('done'), holdMs);
      return () => clearTimeout(id);
    }
    if (!completed.current) {
      completed.current = true;
      onCompleteRef.current();
    }
    return undefined;
  }, [phase, revealed, count, stepMs, holdMs]);

  const skip = () => {
    if (phase === 'running') {
      setRevealed(count);
      setPhase('slam');
    } else if (phase === 'slam') {
      setPhase('done');
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      skip();
    }
  };

  const frame = tallyFrame(tally, revealed, phase !== 'running');
  const tickMs = stepMs * 0.8;
  const shownA = useTickingNumber(frame.a ?? 0, tickMs);
  const shownB = useTickingNumber(frame.b ?? 0, tickMs);
  const shownTotal = useTickingNumber(frame.total, phase === 'running' ? tickMs : 0);
  const active = phase === 'running' ? revealed - 1 : -1;
  const latest = active >= 0 ? tally.contributions[active] : undefined;

  return (
    <section
      className={`tally tally--${phase}`}
      aria-label="Score breakdown"
      role="button"
      tabIndex={0}
      onClick={skip}
      onKeyDown={onKeyDown}
    >
      <div className="tally__readouts">
        <div className={`tally__box tally__box--a ${latest?.kind === 'add' ? 'tally__box--bump' : ''}`} key={`a-${revealed}`}>
          <span className="tally__box-label">{tally.labelA ?? 'Base'}</span>
          <span className="tally__box-value">{formatNumber(shownA)}</span>
        </div>
        <span className="tally__op">×</span>
        <div
          className={`tally__box tally__box--b ${latest?.kind === 'mult' || latest?.kind === 'xmult' ? 'tally__box--bump' : ''}`}
          key={`b-${revealed}`}
        >
          <span className="tally__box-label">{tally.labelB ?? 'Mult'}</span>
          <span className="tally__box-value">{formatNumber(shownB)}</span>
        </div>
        <span className="tally__op">=</span>
        <div className={`tally__total ${phase !== 'running' ? 'tally__total--slam' : ''}`}>
          {formatNumber(shownTotal)}
        </div>
      </div>

      <ol className="tally__sources">
        {tally.contributions.map((c, i) => {
          const state = i === active ? 'active' : i < revealed ? 'done' : 'pending';
          return (
            <li key={c.id} className={`tally__source tally__source--${state} tally__source--${c.kind}`}>
              <span className="tally__source-label">{c.sourceLabel}</span>
              {c.kind !== 'note' && <span className="tally__source-amount">{formatContribution(c)}</span>}
            </li>
          );
        })}
      </ol>

      <div className="tally__footer">
        {onSpeedChange && (
          <button
            type="button"
            className="tally__speed"
            onClick={(e) => {
              e.stopPropagation();
              onSpeedChange(NEXT_SPEED[speed]);
            }}
          >
            Speed: {speed}
          </button>
        )}
        <span className="tally__hint">{phase === 'running' ? 'Click to skip' : 'Click to continue'}</span>
      </div>
    </section>
  );
}
