import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { artUrl } from '../../../assets/art';
import { Icon } from '../../../ui/icons';
import { prefersReducedMotion, speedScale } from '../../../ui/motion';
import { formatAmount } from '../model';
import type { ShiftResult } from '../rules';
import { shiftBeats } from './beats';
import type { Beat, Flourish, ShiftBeats } from './beats';
import './spectacle.css';

/** How the replay paces itself; sounds or other effects can schedule against the same numbers. */
export type ReplayTiming = {
  /** Before the first slot. */
  readonly startMs: number;
  /** From one slot to the next. */
  readonly stepMs: number;
  /** The finale stays up this long before `onDone`. */
  readonly holdMs: number;
  /** Reduced motion: the finale shows at once and no beats play. */
  readonly instant: boolean;
};

/** The replay's pacing under the current Settings (animation speed, reduced motion). */
export function replayTiming(): ReplayTiming {
  const scale = speedScale();
  return { startMs: Math.round(220 * scale), stepMs: Math.round(560 * scale), holdMs: Math.round(1500 * scale), instant: prefersReducedMotion() };
}

export type ShiftReplayProps = {
  result: ShiftResult;
  /** The Shift that ran, for the header. */
  shift: number;
  /** The Margin a Batch starts with (the run's config), so a first-slot Design shows its gain. */
  baseMargin?: number;
  /** Each slot as the token reaches it (in order, `stepMs` apart); not called under reduced motion. */
  onBeat?: (beat: Beat, index: number) => void;
  /** When the leftovers land and the total shows. */
  onFinale?: (beats: ShiftBeats) => void;
  /** After the finale has been up for `holdMs`, or at once when the player skips past it. */
  onDone?: () => void;
};

const FLOURISH_LABEL: Partial<Record<Flourish, string>> = {
  hot: 'Hot',
  'sold-out': 'Sold out',
  'price-gun': 'Price Gun',
  retrigger: 'Again!',
};

/** Up to this many crates ride on the cart, and land in the leftover pile. */
const MAX_CRATES = 8;

/**
 * The scoring spectacle: the hero robot pushes the Batch along the belt slot by slot, the
 * readouts tick, sales send a truck off, and the leftovers pile up before the total lands.
 * Click or Skip jumps to the finale.
 */
export function ShiftReplay({ result, shift, baseMargin, onBeat, onFinale, onDone }: ShiftReplayProps) {
  const data = useMemo(() => shiftBeats(result, baseMargin), [result, baseMargin]);
  const n = data.beats.length;
  const [timing] = useState(replayTiming);
  const [at, setAt] = useState(() => (timing.instant ? n : -1));
  const handlers = useRef({ onBeat, onFinale, onDone });
  handlers.current = { onBeat, onFinale, onDone };

  useEffect(() => {
    if (at >= n) {
      handlers.current.onFinale?.(data);
      const done = window.setTimeout(() => handlers.current.onDone?.(), timing.holdMs);
      return () => window.clearTimeout(done);
    }
    const beat = data.beats[at];
    if (beat !== undefined) handlers.current.onBeat?.(beat, at);
    const next = window.setTimeout(() => setAt((a) => a + 1), at < 0 ? timing.startMs : timing.stepMs);
    return () => window.clearTimeout(next);
  }, [at, n, data, timing]);

  const finished = at >= n;
  const skip = () => (finished ? handlers.current.onDone?.() : setAt(n));
  const now = finished ? null : (data.beats[at] ?? null);
  const last = data.beats[n - 1];
  const units = finished ? data.leftover : (now?.units ?? 0);
  const margin = now?.margin ?? last?.margin ?? 0;
  const sales = finished ? data.total : (now?.sales ?? 0);
  const crates = Math.min(MAX_CRATES, Math.ceil(units / 4));
  const style = { '--slots': n, '--at': finished ? n + 0.6 : Math.max(-0.8, at), '--step': `${timing.stepMs}ms` } as CSSProperties;

  return (
    <section className="tp-replay" data-phase={finished ? 'done' : 'running'} style={style} aria-label={`Shift ${shift} running`} onClick={skip}>
      <header className="tp-replay__head">
        <span className="tp-replay__title">Shift {shift}</span>
        <Readout kind="units" value={`${units}`} label="Units" />
        <Readout kind="margin" value={`$${formatAmount(margin)}`} label="Margin" />
        <Readout kind="sales" value={`$${sales}`} label="Sales" />
        <button
          type="button"
          className="tp-replay__skip"
          onClick={(e) => {
            e.stopPropagation();
            skip();
          }}
        >
          {finished ? 'Continue' : 'Skip'}
        </button>
      </header>

      <div className="tp-replay__belt">
        <ol className="tp-replay__slots">
          {data.beats.map((beat, i) => (
            <Slot key={beat.slot} beat={beat} state={i < at ? 'past' : i === at ? 'active' : 'ahead'} />
          ))}
        </ol>
        {artUrl('token-hero-robot') !== undefined && (
          <span className="tp-replay__token" aria-hidden="true">
            <span className="tp-replay__cart">
              {Array.from({ length: crates }, (_, i) => (
                <span key={i} className="tp-replay__crate" />
              ))}
            </span>
            <img key={at} className="tp-replay__robot" src={artUrl('token-hero-robot')} alt="" />
          </span>
        )}
      </div>

      {finished && (
        <footer className="tp-replay__finale">
          <span className="tp-replay__pile" aria-hidden="true">
            {Array.from({ length: Math.min(MAX_CRATES + 4, data.leftover) }, (_, i) => (
              <span key={i} className="tp-replay__crate" style={{ '--i': i } as CSSProperties} />
            ))}
          </span>
          <span className="tp-replay__leftover">
            {data.leftover > 0 ? `Leftover ${data.leftover} Units` : 'Nothing left over'}
            {data.stored > 0 && `, ${data.stored} stored`}
            {data.cleared > 0 && `, ${data.cleared} cleared`}
            {data.overstockSales !== 0 && ` (${data.overstockSales < 0 ? '-' : '+'}$${Math.abs(data.overstockSales)})`}
          </span>
          <span className="tp-replay__total">${data.total}</span>
        </footer>
      )}
    </section>
  );
}

function Readout({ kind, value, label }: { kind: 'units' | 'margin' | 'sales'; value: string; label: string }) {
  return (
    <span className="tp-replay__readout" data-kind={kind}>
      <Icon name={kind} className="tp-replay__readout-icon" />
      <b key={value}>{value}</b>
      <span className="tp-replay__readout-label">{label}</span>
    </span>
  );
}

function Slot({ beat, state }: { beat: Beat; state: 'past' | 'active' | 'ahead' }) {
  const shown = state !== 'ahead';
  const name = beat.kind === 'welded' ? 'Welded' : (beat.card ?? beat.fixture ?? 'Empty');
  return (
    <li className="tp-replay__slot" data-state={state} data-kind={beat.kind} data-flourishes={beat.flourishes.join(' ') || undefined}>
      <span className="tp-replay__num">{beat.slot}</span>
      <span className="tp-replay__name">{name}</span>
      {beat.fixture !== null && beat.card !== null && (
        <span className="tp-replay__fixture" data-idle={beat.idle || undefined}>
          {beat.fixture}
        </span>
      )}
      {shown && (
        <span className="tp-replay__deltas">
          {beat.marginDelta > 0 && <span data-kind="margin">+${formatAmount(beat.marginDelta)}</span>}
          {beat.unitsDelta > 0 && <span data-kind="units">+{beat.unitsDelta}u</span>}
          {beat.earned > 0 && <span data-kind="sales">+${beat.earned}</span>}
        </span>
      )}
      {state === 'active' && (
        <>
          {beat.flourishes.map((f) =>
            FLOURISH_LABEL[f] === undefined ? null : (
              <span key={f} className={`tp-replay__flourish tp-replay__flourish--${f}`}>
                {FLOURISH_LABEL[f]}
              </span>
            ),
          )}
          {beat.earned > 0 && (
            <>
              <span className="tp-replay__pop">+${beat.earned}</span>
              <span className="tp-replay__truck" aria-hidden="true">
                <Icon name="ship" />
              </span>
            </>
          )}
        </>
      )}
    </li>
  );
}
