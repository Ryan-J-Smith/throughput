import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { shake } from '../motion';
import type { ScoreTallyView, TallySpeed } from '../types';
import { formatContribution, formatNumber, NEXT_SPEED, TALLY_TIMING, tallyFrame } from './tally';
import { useTickingNumber } from './useTickingNumber';

export type ScoreTallyProps = {
  tally: ScoreTallyView;
  speed: TallySpeed;
  /** Fires once, after the final total has been shown. */
  onComplete: () => void;
  /** When provided, renders a speed toggle. */
  onSpeedChange?: (speed: TallySpeed) => void;
};

type Phase = 'running' | 'slam' | 'done';

/**
 * Score breakdown printed like a register receipt: one line per contribution, a running
 * subtotal, then the final total stamped at the end. Big ×mult lines flash and shake the screen.
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
  const bigHit = latest?.kind === 'xmult';

  useEffect(() => {
    if (bigHit) shake(document.querySelector('.screen'));
  }, [bigHit, revealed]);

  return (
    <section
      className={`tally tally--${phase}`}
      aria-label="Score breakdown"
      role="button"
      tabIndex={0}
      onClick={skip}
      onKeyDown={onKeyDown}
    >
      <div className="receipt">
        {bigHit && <div className="receipt__flash" key={`flash-${revealed}`} aria-hidden="true" />}
        <div className="receipt__head">
          <span className="receipt__store">Shelf Life Co.</span>
          <span className="receipt__kind">Sales receipt</span>
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

        <div className="tally__readouts">
          <span className={`tally__box tally__box--a ${latest?.kind === 'add' ? 'tally__box--bump' : ''}`} key={`a-${revealed}`}>
            <span className="tally__box-label">{tally.labelA ?? 'Base'}</span>
            <span className="tally__box-value">{formatNumber(shownA)}</span>
          </span>
          <span className="tally__op">×</span>
          <span
            className={`tally__box tally__box--b ${latest?.kind === 'mult' || bigHit ? 'tally__box--bump' : ''}`}
            key={`b-${revealed}`}
          >
            <span className="tally__box-label">{tally.labelB ?? 'Mult'}</span>
            <span className="tally__box-value">{formatNumber(shownB)}</span>
          </span>
        </div>

        <div className="receipt__total">
          <span className="receipt__total-label">Total</span>
          <span className={`tally__total ${phase !== 'running' ? 'tally__total--slam' : ''}`}>
            {formatNumber(shownTotal)}
          </span>
        </div>

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
      </div>
    </section>
  );
}
